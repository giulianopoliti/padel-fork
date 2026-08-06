'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Trophy,
  FileText,
  Settings,
  CalendarDays,
  Users,
  Tag,
  Award,
  Building2,
  Sparkles,
  Info,
  Clock,
  Calendar,
  X,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import { useForm, type FieldPath } from 'react-hook-form';
import * as z from 'zod';

import { createTournamentAction } from '@/app/api/tournaments/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { getPresetOptionsByType } from '@/config/tournament-format-presets';
import { useUser } from '@/contexts/user-context';
import { useUserClubs } from '@/hooks/use-user-clubs';
import {
  AMERICAN_MULTI_ZONE_FORMAT_OPTIONS,
  AMERICAN_MULTI_ZONE_MATCH_OPTIONS,
  getAmericanMultiZoneAlgorithmFromPresetId,
  getAmericanMultiZoneMatchesFromPresetId,
  getAmericanMultiZonePresetId,
  isAmericanMultiZonePresetId,
  type AmericanMultiZoneAlgorithm,
  type AmericanMultiZoneMatchesPerCouple,
} from '@/lib/services/american-multizone-format-options';
import { buildTournamentFormatConfig } from '@/lib/services/tournament-format-config-builder';
import {
  areCategoriesConsecutive,
  buildTournamentCategoryLabel,
  getCategoryForScore,
  getAvailableMixedSumTargets,
  resolveInitialScoreFromCategories,
  resolvePersistedTournamentCategoryName,
  type TournamentCategoryConfig,
} from '@/lib/services/tournament-category-config';
import { cn } from '@/lib/utils';
import { MAX_TOURNAMENT_PRICE } from '@/lib/constants/tournaments';
import type { CouplesPerZone, TournamentFormatPresetId } from '@/types/tournament-format-v2';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

interface Category {
  name: string;
  lower_range: number;
  upper_range: number | null;
}

interface Club {
  id: string;
  name: string;
  source: 'owned' | 'organization';
}

const DEFAULT_PRESET_BY_TYPE: Record<'AMERICAN' | 'LONG', TournamentFormatPresetId> = {
  AMERICAN: 'AMERICAN_MULTI_ZONE_2',
  LONG: 'LONG_SINGLE_ZONE_BRACKET',
};

const DEFAULT_ENABLE_TRUST_PAYMENT_POLICY =
  process.env.NEXT_PUBLIC_TENANT_KEY !== 'padel-fv';

const PRESET_OPTIONS = {
  AMERICAN: getPresetOptionsByType('AMERICAN'),
  LONG: getPresetOptionsByType('LONG'),
} as const;

const STEP_TITLES = [
  {
    id: 1,
    title: 'Base',
    description: 'Identidad y formato',
    icon: FileText,
  },
  {
    id: 2,
    title: 'Agenda',
    description: 'Fechas del torneo',
    icon: CalendarDays,
  },
  {
    id: 3,
    title: 'Cierre',
    description: 'Cupo y revision final',
    icon: Trophy,
  },
] as const;

const tournamentSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  description: z.string().optional(),
  category_mode: z.enum(['SINGLE', 'RANGE', 'MIXED_SUM'], {
    required_error: 'Selecciona un modo de categoria',
  }),
  primary_category_name: z.string().optional(),
  secondary_category_name: z.string().optional(),
  mixed_sum_target: z.number().int().optional(),
  category_name: z.string().min(1, 'Selecciona una categoria'),
  type: z.enum(['LONG', 'AMERICAN'], {
    required_error: 'Selecciona un tipo de torneo',
  }),
  format_preset: z.string().min(1, 'Selecciona un formato'),
  gender: z.enum(['MALE', 'FEMALE', 'MIXED'], {
    required_error: 'Selecciona un genero',
  }),
  start_date: z.string().min(1, 'La fecha de inicio es obligatoria'),
  start_time: z.string().optional(),
  end_date: z.string().optional(),
  end_time: z.string().optional(),
  max_participants: z.number().min(2, 'Minimo 2 parejas').max(64, 'Maximo 64 parejas').optional(),
  club_id: z.string().min(1, 'Selecciona un club'),
  extra_club_ids: z.array(z.string()).default([]),
  price: z.number().int('El precio por jugador debe ser un numero entero').min(0, 'El precio por jugador no puede ser negativo').max(MAX_TOURNAMENT_PRICE, 'El precio por jugador es demasiado alto').optional(),
  award: z.string().optional(),
  enable_trust_based_payment_policy: z.boolean().default(DEFAULT_ENABLE_TRUST_PAYMENT_POLICY),
  trust_policy_min_played_tournaments: z.number().int('Debe ser un numero entero').min(0, 'No puede ser negativo').default(2),
  transfer_alias: z.string().optional(),
  transfer_amount_per_player: z.number().min(0, 'No puede ser negativo').optional(),
  american_multizone_algorithm: z.enum(['SERPENTINE_BY_ZONE', 'GLOBAL_STANDINGS', 'HYBRID_FIRSTS_GLOBAL_REST_ZONES']).optional(),
  american_zone_matches_per_couple: z.enum(['2', '3']).optional(),
  american_couples_per_zone: z.enum(['2', '3', 'ALL']).optional(),
  single_bracket_advance_count: z.number().int().min(2, 'Minimo 2 parejas').optional(),
  gold_count: z.number().int().min(0, 'No puede ser negativo').optional(),
  silver_count: z.number().int().min(0, 'No puede ser negativo').optional(),
  eliminated_count: z.number().int().min(0, 'No puede ser negativo').optional(),
}).refine((data) => {
  if (data.type === 'AMERICAN' && !data.start_time) {
    return false;
  }
  return true;
}, {
  message: 'Para torneos americanos, la hora de inicio es obligatoria',
  path: ['start_time'],
}).refine((data) => {
  if (data.type === 'LONG' && !data.end_date) {
    return false;
  }
  return true;
}, {
  message: 'Para torneos largos, la fecha de finalizacion es obligatoria',
  path: ['end_date'],
}).refine((data) => {
  return !data.extra_club_ids.includes(data.club_id);
}, {
  message: 'El club principal no puede estar en clubes adicionales',
  path: ['extra_club_ids'],
}).refine((data) => {
  if (data.category_mode !== 'SINGLE') {
    return true;
  }

  return Boolean(data.primary_category_name?.trim());
}, {
  message: 'Selecciona una categoria base',
  path: ['primary_category_name'],
}).refine((data) => {
  if (data.category_mode !== 'RANGE') {
    return true;
  }

  return Boolean(data.primary_category_name?.trim()) && Boolean(data.secondary_category_name?.trim());
}, {
  message: 'Selecciona las dos categorias de la combinacion',
  path: ['secondary_category_name'],
}).refine((data) => {
  if (data.category_mode !== 'RANGE') {
    return true;
  }

  return data.primary_category_name !== data.secondary_category_name;
}, {
  message: 'Las categorias combinadas deben ser distintas',
  path: ['secondary_category_name'],
}).refine((data) => {
  if (data.category_mode !== 'MIXED_SUM') {
    return true;
  }

  return typeof data.mixed_sum_target === 'number' && Number.isFinite(data.mixed_sum_target);
}, {
  message: 'Selecciona una suma objetivo',
  path: ['mixed_sum_target'],
}).refine((data) => {
  if (data.category_mode !== 'MIXED_SUM') {
    return true;
  }

  return data.gender === 'MIXED';
}, {
  message: 'La categoria por suma solo esta disponible para torneos mixtos',
  path: ['gender'],
}).refine((data) => {
  if (data.type !== 'AMERICAN' || !data.enable_trust_based_payment_policy) {
    return true;
  }

  return Boolean(data.transfer_alias?.trim());
}, {
  message: 'Completa el alias para transferencia',
  path: ['transfer_alias'],
}).refine((data) => {
  if (data.type !== 'AMERICAN' || !data.enable_trust_based_payment_policy) {
    return true;
  }

  return typeof data.transfer_amount_per_player === 'number' && data.transfer_amount_per_player > 0;
}, {
  message: 'Indica la seña por jugador',
  path: ['transfer_amount_per_player'],
});

type TournamentFormData = z.infer<typeof tournamentSchema>;

const TYPE_COPY = {
  AMERICAN: {
    title: 'Americano',
    description: 'Pensado para resolverse en un solo dia, con horarios mas definidos.',
    badge: '1 dia',
  },
  LONG: {
    title: 'Long',
    description: 'Ideal para una competencia distribuida en varios dias con cierre estimado.',
    badge: 'Varios dias',
  },
} as const;

const formatInputDate = (date: string) => {
  if (!date) return 'Sin definir';
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatCurrency = (value?: number) => {
  if (value === undefined || value === null) return 'Sin definir';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
};

const getPresetMeta = (presetId: string) => {
  const preset = [...PRESET_OPTIONS.AMERICAN, ...PRESET_OPTIONS.LONG].find((option) => option.presetId === presetId);
  if (!preset) return [];

  const zoneLabel = preset.zoneMode === 'MULTI_ZONE' ? 'Multiples zonas' : 'Zona unica';
  const stageLabel = preset.zoneStage === 'ROUND_ROBIN' ? 'Todos contra todos' : `${preset.targetMatchesPerCouple ?? 0} partidos por pareja`;
  const qualificationLabel = preset.qualificationSource === 'GLOBAL_STANDINGS'
    ? 'Tabla general'
    : preset.qualificationSource === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'
      ? 'Primeros por tabla general'
      : 'Posiciones por zona';
  const bracketLabel = preset.bracketMode === 'SINGLE'
    ? 'Llave unica'
    : preset.bracketMode === 'GOLD_SILVER'
      ? 'Copa Oro y Plata'
      : 'Campeon directo';

  return [zoneLabel, stageLabel, qualificationLabel, bracketLabel];
};

const buildCategoryConfigFromFormValues = (
  values: Pick<
    TournamentFormData,
    'category_mode' | 'primary_category_name' | 'secondary_category_name' | 'mixed_sum_target'
  >,
): TournamentCategoryConfig | null => {
  if (values.category_mode === 'SINGLE') {
    if (!values.primary_category_name?.trim()) {
      return null;
    }

    return {
      mode: 'SINGLE',
      category: values.primary_category_name.trim(),
      validationEnabled: false,
    };
  }

  if (values.category_mode === 'RANGE') {
    if (!values.primary_category_name?.trim() || !values.secondary_category_name?.trim()) {
      return null;
    }

    return {
      mode: 'RANGE',
      categoryA: values.primary_category_name.trim(),
      categoryB: values.secondary_category_name.trim(),
      validationEnabled: false,
    };
  }

  if (typeof values.mixed_sum_target !== 'number' || !Number.isFinite(values.mixed_sum_target)) {
    return null;
  }

  return {
    mode: 'MIXED_SUM',
    targetSum: values.mixed_sum_target,
    mixedPairRequired: true,
    validationEnabled: false,
  };
};

export default function TournamentCreateForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { user, userDetails, loading: isUserLoading } = useUser();
  const { clubs, isLoading: isClubsLoading, error: clubsError, defaultClubId } = useUserClubs();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const form = useForm<TournamentFormData>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: {
      name: '',
      description: '',
      category_mode: 'SINGLE',
      primary_category_name: '',
      secondary_category_name: '',
      mixed_sum_target: undefined,
      category_name: '',
      type: 'AMERICAN',
      format_preset: DEFAULT_PRESET_BY_TYPE.AMERICAN,
      gender: 'MALE',
      start_date: '',
      start_time: '',
      end_date: '',
      end_time: '',
      max_participants: undefined,
      club_id: '',
      extra_club_ids: [],
      price: undefined,
      award: '',
      enable_trust_based_payment_policy: DEFAULT_ENABLE_TRUST_PAYMENT_POLICY,
      trust_policy_min_played_tournaments: 2,
      transfer_alias: '',
      transfer_amount_per_player: undefined,
      american_multizone_algorithm: 'SERPENTINE_BY_ZONE',
      american_zone_matches_per_couple: '2',
      american_couples_per_zone: 'ALL',
      single_bracket_advance_count: 8,
      gold_count: 4,
      silver_count: 4,
      eliminated_count: 0,
    },
  });

  const watchedValues = form.watch();
  const selectedType = watchedValues.type;
  const categoryMode = watchedValues.category_mode;
  const isAmericanTournament = selectedType === 'AMERICAN';
  const presetOptions = PRESET_OPTIONS[selectedType];
  const selectedPreset = presetOptions.find((preset) => preset.presetId === watchedValues.format_preset);
  const nonMultiZoneAmericanPresetOptions = PRESET_OPTIONS.AMERICAN.filter(
    (preset) => !isAmericanMultiZonePresetId(preset.presetId)
  );
  const selectedAmericanMultiZoneAlgorithm =
    (watchedValues.american_multizone_algorithm as AmericanMultiZoneAlgorithm | undefined) ??
    getAmericanMultiZoneAlgorithmFromPresetId(watchedValues.format_preset);
  const selectedAmericanZoneMatchesPerCouple =
    (watchedValues.american_zone_matches_per_couple === '3' ? 3 : 2) as AmericanMultiZoneMatchesPerCouple;
  const isSelectedAmericanMultiZone = isAmericanMultiZonePresetId(watchedValues.format_preset);
  const extraClubIds = form.watch('extra_club_ids') || [];
  const userRole = userDetails?.role;
  const selectedClub = clubs.find((club) => club.id === watchedValues.club_id);
  const selectedExtraClubs = clubs.filter((club) => extraClubIds.includes(club.id));
  const progressValue = (currentStep / STEP_TITLES.length) * 100;
  const activeStep = STEP_TITLES[currentStep - 1];
  const availableMixedSumTargets = useMemo(() => getAvailableMixedSumTargets(categories), [categories]);
  const categoryPreview = useMemo(() => {
    const categoryConfig = buildCategoryConfigFromFormValues({
      category_mode: watchedValues.category_mode,
      primary_category_name: watchedValues.primary_category_name,
      secondary_category_name: watchedValues.secondary_category_name,
      mixed_sum_target: watchedValues.mixed_sum_target,
    });

    if (!categoryConfig || categories.length === 0) {
      return null;
    }

    try {
      const initialScore = resolveInitialScoreFromCategories(categoryConfig, categories);
      const persistedCategory = getCategoryForScore(categories, initialScore);

      return {
        label: buildTournamentCategoryLabel(categoryConfig),
        initialScore,
        persistedCategoryName: persistedCategory?.name ?? null,
      };
    } catch (previewError) {
      console.error('Error calculating category preview:', previewError);
      return null;
    }
  }, [
    categories,
    watchedValues.category_mode,
    watchedValues.mixed_sum_target,
    watchedValues.primary_category_name,
    watchedValues.secondary_category_name,
  ]);
  const rangeSecondaryOptions = useMemo(() => {
    if (!watchedValues.primary_category_name) {
      return categories;
    }

    return categories.filter((category) =>
      areCategoriesConsecutive(categories, watchedValues.primary_category_name || '', category.name),
    );
  }, [categories, watchedValues.primary_category_name]);

  const handleAmericanMultiZoneAlgorithmChange = (
    algorithm: AmericanMultiZoneAlgorithm,
    onPresetChange?: (presetId: TournamentFormatPresetId) => void
  ) => {
    const nextPresetId = getAmericanMultiZonePresetId(algorithm, selectedAmericanZoneMatchesPerCouple);
    form.setValue('american_multizone_algorithm', algorithm, { shouldDirty: true, shouldValidate: true });

    if (onPresetChange) {
      onPresetChange(nextPresetId);
      return;
    }

    form.setValue('format_preset', nextPresetId, { shouldDirty: true, shouldValidate: true });
  };

  const handleAmericanZoneMatchesChange = (value: string) => {
    const nextMatches = (value === '3' ? 3 : 2) as AmericanMultiZoneMatchesPerCouple;
    const nextPresetId = getAmericanMultiZonePresetId(selectedAmericanMultiZoneAlgorithm, nextMatches);

    form.setValue('american_zone_matches_per_couple', String(nextMatches) as '2' | '3', {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue('format_preset', nextPresetId, { shouldDirty: true, shouldValidate: true });
  };

  useEffect(() => {
    if (categoryMode !== 'RANGE') {
      return;
    }

    const secondaryCategoryName = form.getValues('secondary_category_name');
    if (!secondaryCategoryName) {
      return;
    }

    const isStillAllowed = rangeSecondaryOptions.some((category) => category.name === secondaryCategoryName);
    if (!isStillAllowed) {
      form.setValue('secondary_category_name', '', { shouldValidate: true });
    }
  }, [categoryMode, form, rangeSecondaryOptions]);

  useEffect(() => {
    async function fetchCategories() {
      if (isUserLoading) return;

      if (!user) {
        router.push('/login');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('name, lower_range, upper_range')
          .order('lower_range', { ascending: true });

        if (categoriesError) {
          throw new Error(`Error al cargar categorias: ${categoriesError.message}`);
        }

        setCategories(categoriesData || []);
      } catch (err: any) {
        console.error('Error fetching categories:', err);
        setError(err.message || 'Error al cargar categorias');
      } finally {
        setIsLoading(false);
      }
    }

    fetchCategories();
  }, [user, isUserLoading, supabase, router]);

  useEffect(() => {
    if (selectedType === 'AMERICAN') {
      form.setValue('end_date', '');
      form.setValue('end_time', '');
    } else {
      form.setValue('start_time', '');
      form.setValue('end_time', '');
    }
  }, [selectedType, form]);

  useEffect(() => {
    if (!selectedType) return;

    const validPresetIds = PRESET_OPTIONS[selectedType].map((preset) => preset.presetId);
    const currentPresetId = form.getValues('format_preset');

    if (!currentPresetId || !validPresetIds.includes(currentPresetId as TournamentFormatPresetId)) {
      const nextPreset = DEFAULT_PRESET_BY_TYPE[selectedType];
      form.setValue('format_preset', nextPreset);

      const preset = PRESET_OPTIONS[selectedType].find((option) => option.presetId === nextPreset);
      if (preset?.advancementConfig.kind === 'SINGLE') {
        form.setValue('single_bracket_advance_count', preset.advancementConfig.advanceCount);
      }
      if (preset?.advancementConfig.kind === 'PER_ZONE_TOP') {
        form.setValue('american_couples_per_zone', String(preset.advancementConfig.couplesPerZone) as '2' | '3' | 'ALL');
      }
      if (preset?.advancementConfig.kind === 'GOLD_SILVER') {
        form.setValue('gold_count', preset.advancementConfig.goldCount);
        form.setValue('silver_count', preset.advancementConfig.silverCount);
        form.setValue('eliminated_count', preset.advancementConfig.eliminatedCount);
      }
    }
  }, [selectedType, form]);

  useEffect(() => {
    if (selectedType !== 'AMERICAN' || !isAmericanMultiZonePresetId(watchedValues.format_preset)) {
      return;
    }

    const algorithm = getAmericanMultiZoneAlgorithmFromPresetId(watchedValues.format_preset);
    const matches = getAmericanMultiZoneMatchesFromPresetId(watchedValues.format_preset);

    if (form.getValues('american_multizone_algorithm') !== algorithm) {
      form.setValue('american_multizone_algorithm', algorithm, { shouldValidate: false });
    }

    if (form.getValues('american_zone_matches_per_couple') !== String(matches)) {
      form.setValue('american_zone_matches_per_couple', String(matches) as '2' | '3', { shouldValidate: false });
    }
  }, [form, selectedType, watchedValues.format_preset]);

  useEffect(() => {
    if (!selectedPreset) return;

    if (selectedPreset.advancementConfig.kind === 'SINGLE') {
      form.setValue('single_bracket_advance_count', selectedPreset.advancementConfig.advanceCount);
    }

    if (selectedPreset.advancementConfig.kind === 'PER_ZONE_TOP') {
      form.setValue('american_couples_per_zone', String(selectedPreset.advancementConfig.couplesPerZone) as '2' | '3' | 'ALL');
    }

    if (selectedPreset.advancementConfig.kind === 'GOLD_SILVER') {
      form.setValue('gold_count', selectedPreset.advancementConfig.goldCount);
      form.setValue('silver_count', selectedPreset.advancementConfig.silverCount);
      form.setValue('eliminated_count', selectedPreset.advancementConfig.eliminatedCount);
    }
  }, [selectedPreset, form]);

  useEffect(() => {
    if (userRole !== 'ORGANIZADOR' && defaultClubId && !form.getValues('club_id')) {
      form.setValue('club_id', defaultClubId);
    }
  }, [defaultClubId, userRole, form]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name === 'club_id') {
        const mainId = values.club_id as string;
        const extras = (values.extra_club_ids as string[]) || [];
        if (mainId && extras.includes(mainId)) {
          form.setValue('extra_club_ids', extras.filter((id) => id !== mainId));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (categoryMode === 'SINGLE') {
      if (form.getValues('secondary_category_name')) {
        form.setValue('secondary_category_name', '', { shouldValidate: false });
      }
      if (form.getValues('mixed_sum_target') !== undefined) {
        form.setValue('mixed_sum_target', undefined, { shouldValidate: false });
      }
    }

    if (categoryMode === 'RANGE') {
      if (form.getValues('mixed_sum_target') !== undefined) {
        form.setValue('mixed_sum_target', undefined, { shouldValidate: false });
      }
    }

    if (categoryMode === 'MIXED_SUM') {
      if (form.getValues('secondary_category_name')) {
        form.setValue('secondary_category_name', '', { shouldValidate: false });
      }
      if (form.getValues('gender') !== 'MIXED') {
        form.setValue('gender', 'MIXED', { shouldValidate: true });
      }
    }
  }, [categoryMode, form]);

  useEffect(() => {
    const categoryConfig = buildCategoryConfigFromFormValues({
      category_mode: watchedValues.category_mode,
      primary_category_name: watchedValues.primary_category_name,
      secondary_category_name: watchedValues.secondary_category_name,
      mixed_sum_target: watchedValues.mixed_sum_target,
    });

    if (!categoryConfig || categories.length === 0) {
      if (form.getValues('category_name') !== '') {
        form.setValue('category_name', '', {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
      return;
    }

    try {
      const persistedCategoryName = resolvePersistedTournamentCategoryName(categoryConfig, categories);

      if (form.getValues('category_name') !== persistedCategoryName) {
        form.setValue('category_name', persistedCategoryName, {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    } catch {
      if (form.getValues('category_name') !== '') {
        form.setValue('category_name', '', {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    }
  }, [
    categories,
    form,
    watchedValues.category_mode,
    watchedValues.mixed_sum_target,
    watchedValues.primary_category_name,
    watchedValues.secondary_category_name,
  ]);

  const handleToggleExtraClub = (clubId: string) => {
    const mainId = form.getValues('club_id');
    if (!clubId || clubId === mainId) return;

    const next = new Set<string>(extraClubIds);
    if (next.has(clubId)) {
      next.delete(clubId);
    } else {
      next.add(clubId);
    }

    form.setValue('extra_club_ids', Array.from(next), { shouldValidate: true });
  };

  const getStepFields = (): FieldPath<TournamentFormData>[] => {
    if (currentStep === 1) {
      const baseFields: (keyof TournamentFormData)[] = ['name', 'category_mode', 'category_name', 'type', 'format_preset', 'gender', 'club_id'];

      if (categoryMode === 'SINGLE') {
        baseFields.push('primary_category_name');
      }

      if (categoryMode === 'RANGE') {
        baseFields.push('primary_category_name', 'secondary_category_name');
      }

      if (categoryMode === 'MIXED_SUM') {
        baseFields.push('mixed_sum_target');
      }

      if (selectedPreset?.advancementConfig.kind === 'SINGLE') {
        baseFields.push('single_bracket_advance_count');
      }

      if (selectedPreset?.advancementConfig.kind === 'PER_ZONE_TOP') {
        baseFields.push('american_couples_per_zone');
      }

      if (selectedPreset?.advancementConfig.kind === 'GOLD_SILVER') {
        baseFields.push('gold_count', 'silver_count', 'eliminated_count');
      }

      return baseFields;
    }

    if (currentStep === 2) {
      return isAmericanTournament
        ? ['start_date', 'start_time']
        : ['start_date', 'end_date'];
    }

    if (currentStep === 3 && isAmericanTournament && watchedValues.enable_trust_based_payment_policy) {
      return ['transfer_alias', 'transfer_amount_per_player', 'trust_policy_min_played_tournaments'];
    }

    return [];
  };

  const handleNextStep = async () => {
    const fields = getStepFields();
    const isValid = fields.length === 0 ? true : await form.trigger(fields);

    if (!isValid) return;
    setCurrentStep((previous) => Math.min(previous + 1, STEP_TITLES.length));
  };

  const handlePreviousStep = () => {
    setCurrentStep((previous) => Math.max(previous - 1, 1));
  };

  const handleCreateTournament = async () => {
    if (isSubmitting) return;
    await form.handleSubmit(onSubmit)();
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) return;

    if (currentStep < STEP_TITLES.length) {
      await handleNextStep();
      return;
    }

    await handleCreateTournament();
  };

  const onSubmit = async (data: TournamentFormData) => {
    if (currentStep < STEP_TITLES.length) {
      await handleNextStep();
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const formatDateTime = (date: string, time?: string) => {
        if (!date) return null;

        if (!time) {
          const dateObj = new Date(`${date}T12:00:00`);
          return dateObj.toISOString();
        }

        const fullTime = time.length === 5 ? `${time}:00` : time;
        const localDate = new Date(`${date}T${fullTime}`);
        return localDate.toISOString();
      };

      const dataForAction = {
        category_config: buildCategoryConfigFromFormValues({
          category_mode: data.category_mode,
          primary_category_name: data.primary_category_name,
          secondary_category_name: data.secondary_category_name,
          mixed_sum_target: data.mixed_sum_target,
        }),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        category_name: (() => {
          const categoryConfig = buildCategoryConfigFromFormValues({
            category_mode: data.category_mode,
            primary_category_name: data.primary_category_name,
            secondary_category_name: data.secondary_category_name,
            mixed_sum_target: data.mixed_sum_target,
          });

          if (!categoryConfig) {
            throw new Error('No se pudo construir la configuracion de categoria');
          }

          if (categoryConfig.mode === 'RANGE' && !areCategoriesConsecutive(categories, categoryConfig.categoryA, categoryConfig.categoryB)) {
            throw new Error('La categoria combinada solo permite categorias consecutivas');
          }

          return resolvePersistedTournamentCategoryName(categoryConfig, categories);
        })(),
        type: data.type as 'LONG' | 'AMERICAN',
        format_config: buildTournamentFormatConfig({
          presetId: data.format_preset as TournamentFormatPresetId,
          couplesPerZone: data.american_couples_per_zone
            ? data.american_couples_per_zone === 'ALL'
              ? 'ALL'
              : Number(data.american_couples_per_zone) as CouplesPerZone
            : undefined,
          singleAdvanceCount: data.single_bracket_advance_count,
          goldCount: data.gold_count,
          silverCount: data.silver_count,
          eliminatedCount: data.eliminated_count,
        }),
        gender: data.gender as 'MALE' | 'FEMALE' | 'MIXED',
        start_date: formatDateTime(data.start_date, data.start_time),
        end_date: data.type === 'LONG' && data.end_date ? formatDateTime(data.end_date) : null,
        max_participants: data.max_participants || null,
        club_id: data.club_id,
        extra_club_ids: (data.extra_club_ids || []).filter((id) => id && id !== data.club_id),
        price: data.price ?? null,
        award: data.award?.trim() || null,
        enable_trust_based_payment_policy:
          data.type === 'AMERICAN' ? data.enable_trust_based_payment_policy : false,
        trust_policy_min_played_tournaments: data.trust_policy_min_played_tournaments ?? 2,
        transfer_alias: data.transfer_alias?.trim() || null,
        transfer_amount_per_player:
          data.type === 'AMERICAN' && data.enable_trust_based_payment_policy
            ? data.transfer_amount_per_player ?? null
            : null,
      };

      const result = await createTournamentAction(dataForAction);

      if (result.success && result.tournament?.id) {
        setSuccessMessage('Torneo creado exitosamente. Redirigiendo...');
        router.refresh();
        setTimeout(() => {
          window.location.href = `/tournaments/${result.tournament.id}`;
        }, 2000);
        return;
      }

      throw new Error(result.error || 'Error desconocido al crear el torneo');
    } catch (err: any) {
      setError(err.message || 'Error al crear el torneo');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || isUserLoading || isClubsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="space-y-4 text-center">
          <div className="relative">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-slate-900" />
            <div className="absolute inset-0 mx-auto h-12 w-12 rounded-full border-2 border-slate-200 animate-pulse" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-slate-900">Preparando asistente...</p>
            <p className="text-sm text-slate-500">Cargando categorias, clubes y configuracion</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="container mx-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3 sm:items-center">
              <Button asChild variant="ghost" size="sm" className="h-9 px-2 text-slate-600 hover:text-slate-900">
                <Link href="/tournaments">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Volver
                </Link>
              </Button>

              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                <Trophy className="h-3.5 w-3.5 text-slate-700" />
                <span>Paso {currentStep} de {STEP_TITLES.length}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-900 sm:h-5 sm:w-5" />
                  <h1 className="text-2xl font-light text-slate-900 sm:text-3xl">Crear torneo</h1>
                </div>
                <p className="mt-1 text-sm text-slate-500">Flujo simple, mismo backend y mismas reglas.</p>
              </div>

              <div className="min-w-0 text-left sm:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Etapa actual</p>
                <p className="text-sm font-medium text-slate-800">{activeStep.title}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Progreso</span>
                <span className="font-medium text-slate-700">{Math.round(progressValue)}%</span>
              </div>
              <Progress value={progressValue} className="h-1.5" />

              <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
                {STEP_TITLES.map((step) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;

                  return (
                    <div
                      key={step.id}
                      className={cn(
                        'flex min-w-[112px] items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors',
                        isActive && 'border-slate-900 bg-slate-900 text-white',
                        isCompleted && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                        !isActive && !isCompleted && 'border-slate-200 bg-white text-slate-600'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                          isActive && 'border-white/20 bg-white/10',
                          isCompleted && 'border-emerald-200 bg-white',
                          !isActive && !isCompleted && 'border-slate-200 bg-slate-50'
                        )}
                      >
                        {isCompleted ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      </div>
                      <span className="truncate font-medium">{step.title}</span>
                    </div>
                  );
                })}
              </div>

              <div className="hidden grid-cols-3 gap-3 md:grid">
                {STEP_TITLES.map((step) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;

                  return (
                    <div
                      key={step.id}
                      className={cn(
                        'rounded-xl border px-4 py-3 transition-colors',
                        isActive && 'border-slate-900 bg-slate-900 text-white shadow-sm',
                        isCompleted && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                        !isActive && !isCompleted && 'border-slate-200 bg-white text-slate-600'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full border',
                            isActive && 'border-white/30 bg-white/10',
                            isCompleted && 'border-emerald-200 bg-white',
                            !isActive && !isCompleted && 'border-slate-200 bg-slate-50'
                          )}
                        >
                          {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Paso {step.id}: {step.title}</p>
                          <p className={cn('mt-1 text-xs', isActive ? 'text-slate-200' : isCompleted ? 'text-emerald-700' : 'text-slate-500')}>
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
          {error && (
            <Alert className="border-red-200/60 bg-red-50/80">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          {clubsError && (
            <Alert className="border-red-200/60 bg-red-50/80">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{clubsError}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="border-emerald-200/60 bg-emerald-50/80">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-700">{successMessage}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-4 sm:space-y-6">
              {currentStep === 1 && (
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader className="space-y-2 border-b border-slate-100 p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-3 text-lg font-light text-slate-900 sm:text-xl">
                      <Settings className="h-5 w-5 text-slate-700" />
                      Datos base del torneo
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-500">
                      Defini identidad, formato y club principal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-4 sm:space-y-8 sm:p-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">Nombre del torneo</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ej: Torneo Apertura Club Norte"
                                className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Categoria visible</p>
                        <p className="mt-2 text-base font-medium text-slate-900">
                          {categoryPreview?.label || 'Configura el modo para generar la etiqueta'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Esta es la etiqueta que ve la gente. Internamente se persiste una categoria base valida para respetar la FK actual.
                        </p>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="category_mode"
                      render={({ field }) => (
                        <FormItem className="space-y-4">
                          <div>
                            <FormLabel className="font-medium text-slate-700">Modo de categoria</FormLabel>
                            <p className="mt-1 text-sm text-slate-500">
                              Define si el torneo usa una categoria simple, una combinacion o una suma mixta.
                            </p>
                          </div>
                          <FormControl>
                            <RadioGroup
                              value={field.value}
                              onValueChange={field.onChange}
                              className="grid grid-cols-1 gap-3 lg:grid-cols-3"
                            >
                              {[
                                { value: 'SINGLE', title: 'Simple', description: 'Una sola categoria base.' },
                                { value: 'RANGE', title: 'Combinada', description: 'Ej: 6ta-7ma.' },
                                { value: 'MIXED_SUM', title: 'Mixto por suma', description: 'Ej: Suma 11 o Suma 12.' },
                              ].map((option) => {
                                const isSelected = field.value === option.value;

                                return (
                                  <label
                                    key={option.value}
                                    className={cn(
                                      'flex cursor-pointer rounded-xl border p-4 transition-all',
                                      isSelected
                                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                                    )}
                                  >
                                    <RadioGroupItem value={option.value} className="mt-1 border-current text-current" />
                                    <div className="ml-3">
                                      <p className="font-medium">{option.title}</p>
                                      <p className={cn('mt-1 text-sm', isSelected ? 'text-slate-200' : 'text-slate-500')}>
                                        {option.description}
                                      </p>
                                    </div>
                                  </label>
                                );
                              })}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {categoryMode === 'SINGLE' && (
                      <FormField
                        control={form.control}
                        name="primary_category_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">Categoria base</FormLabel>
                            <FormControl>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                  <SelectValue placeholder="Selecciona una categoria" />
                                </SelectTrigger>
                                <SelectContent>
                                  {categories.map((category) => (
                                    <SelectItem key={category.name} value={category.name}>
                                      {category.name} · {category.lower_range}
                                      {category.upper_range !== null ? `-${category.upper_range}` : '+'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormDescription className="text-slate-500">
                              Los jugadores nuevos arrancan en el puntaje base de esta categoria.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {categoryMode === 'RANGE' && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                        <FormField
                          control={form.control}
                          name="primary_category_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-medium text-slate-700">Categoria A</FormLabel>
                              <FormControl>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                    <SelectValue placeholder="Primera categoria" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categories.map((category) => (
                                      <SelectItem key={category.name} value={category.name}>
                                        {category.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="secondary_category_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-medium text-slate-700">Categoria B</FormLabel>
                              <FormControl>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                    <SelectValue placeholder="Segunda categoria" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {rangeSecondaryOptions.map((category) => (
                                      <SelectItem key={category.name} value={category.name}>
                                        {category.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {categoryMode === 'MIXED_SUM' && (
                      <FormField
                        control={form.control}
                        name="mixed_sum_target"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">Suma objetivo</FormLabel>
                            <FormControl>
                              <Select
                                onValueChange={(value) => field.onChange(value ? Number(value) : undefined)}
                                value={field.value !== undefined ? String(field.value) : undefined}
                              >
                                <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                  <SelectValue placeholder="Selecciona una suma" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableMixedSumTargets.map((targetSum) => (
                                    <SelectItem key={targetSum} value={String(targetSum)}>
                                      Suma {targetSum}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormDescription className="text-slate-500">
                              Disponible solo para torneos mixtos. La validacion de categoria queda preparada y el puntaje inicial sale de categories.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Puntaje inicial</p>
                        <p className="mt-2 text-xl font-medium text-slate-900">
                          {categoryPreview ? `${categoryPreview.initialScore} pts` : 'Pendiente'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Se calcula leyendo `categories.lower_range` desde la base.
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Regla actual</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {categoryPreview?.label || 'Sin definir'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Se persiste como {categoryPreview?.persistedCategoryName || 'sin categoria base'} para respetar la FK actual.
                        </p>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-medium text-slate-700">Descripcion</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Conta brevemente de que se trata el torneo o que deben saber los jugadores."
                              className="min-h-[104px] resize-none border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-slate-500">
                            Opcional, pero ayuda a que la convocatoria sea mas clara.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem className="space-y-4">
                          <div>
                            <FormLabel className="font-medium text-slate-700">Tipo de torneo</FormLabel>
                            <p className="mt-1 text-sm text-slate-500">Elegi si se juega en una jornada o distribuido en varios dias.</p>
                          </div>
                          <FormControl>
                            <RadioGroup
                              value={field.value}
                              onValueChange={field.onChange}
                              className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4"
                            >
                              {(['AMERICAN', 'LONG'] as const).map((type) => {
                                const isSelected = field.value === type;
                                const copy = TYPE_COPY[type];

                                return (
                                  <label
                                    key={type}
                                    className={cn(
                                      'flex cursor-pointer rounded-xl border p-4 transition-all sm:p-5',
                                      isSelected
                                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                                    )}
                                  >
                                    <RadioGroupItem value={type} className="mt-1 border-current text-current" />
                                    <div className="ml-3 flex-1 sm:ml-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-base font-medium">{copy.title}</p>
                                          <p className={cn('mt-1 text-sm', isSelected ? 'text-slate-200' : 'text-slate-500')}>
                                            {copy.description}
                                          </p>
                                        </div>
                                        <Badge variant={isSelected ? 'secondary' : 'outline'} className={cn('shrink-0', isSelected && 'border-white/20 bg-white/10 text-white')}>
                                          {copy.badge}
                                        </Badge>
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="format_preset"
                      render={({ field }) => (
                        <FormItem className="space-y-4">
                          <div>
                            <FormLabel className="font-medium text-slate-700">Formato dentro de {TYPE_COPY[selectedType].title}</FormLabel>
                            <p className="mt-1 text-sm text-slate-500">
                              Elegi zonas, cantidad de partidos y como cierra la competencia.
                            </p>
                          </div>
                          <FormControl>
                            {selectedType === 'AMERICAN' ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                                  {AMERICAN_MULTI_ZONE_FORMAT_OPTIONS.map((option) => {
                                    const isSelected =
                                      isSelectedAmericanMultiZone &&
                                      selectedAmericanMultiZoneAlgorithm === option.id;

                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleAmericanMultiZoneAlgorithmChange(option.id, field.onChange)}
                                        className={cn(
                                          'rounded-xl border p-4 text-left transition-all sm:p-5',
                                          isSelected
                                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                            : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                                        )}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-base font-medium">{option.label}</p>
                                            <p className={cn('mt-1 text-sm leading-relaxed', isSelected ? 'text-slate-200' : 'text-slate-500')}>
                                              {option.description}
                                            </p>
                                          </div>
                                          {isSelected && (
                                            <div className="rounded-full border border-white/20 bg-white/10 p-2">
                                              <Check className="h-4 w-4" />
                                            </div>
                                          )}
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <Badge
                                            variant="outline"
                                            className={cn('border-current/20 bg-transparent', isSelected ? 'text-white' : 'text-slate-600')}
                                          >
                                            Multiples zonas
                                          </Badge>
                                          <Badge
                                            variant="outline"
                                            className={cn('border-current/20 bg-transparent', isSelected ? 'text-white' : 'text-slate-600')}
                                          >
                                            {option.id === 'GLOBAL_STANDINGS'
                                              ? 'Tabla general'
                                              : option.id === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES'
                                                ? 'Primeros por tabla general'
                                                : 'Posiciones por zona'}
                                          </Badge>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>

                                {nonMultiZoneAmericanPresetOptions.length > 0 && (
                                  <div className="space-y-3">
                                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Otros formatos americanos</p>
                                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                                      {nonMultiZoneAmericanPresetOptions.map((preset) => {
                                        const isSelected = field.value === preset.presetId;
                                        const presetMeta = getPresetMeta(preset.presetId);

                                        return (
                                          <button
                                            key={preset.presetId}
                                            type="button"
                                            onClick={() => field.onChange(preset.presetId)}
                                            className={cn(
                                              'rounded-xl border p-4 text-left transition-all sm:p-5',
                                              isSelected
                                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                                            )}
                                          >
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="min-w-0">
                                                <p className="text-base font-medium">{preset.display.name}</p>
                                                <p className={cn('mt-1 text-sm leading-relaxed', isSelected ? 'text-slate-200' : 'text-slate-500')}>
                                                  {preset.display.description}
                                                </p>
                                              </div>
                                              {isSelected && (
                                                <div className="rounded-full border border-white/20 bg-white/10 p-2">
                                                  <Check className="h-4 w-4" />
                                                </div>
                                              )}
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                              {presetMeta.map((item) => (
                                                <Badge
                                                  key={item}
                                                  variant="outline"
                                                  className={cn('border-current/20 bg-transparent', isSelected ? 'text-white' : 'text-slate-600')}
                                                >
                                                  {item}
                                                </Badge>
                                              ))}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                                {presetOptions.map((preset) => {
                                  const isSelected = field.value === preset.presetId;
                                  const presetMeta = getPresetMeta(preset.presetId);

                                  return (
                                    <button
                                      key={preset.presetId}
                                      type="button"
                                      onClick={() => field.onChange(preset.presetId)}
                                      className={cn(
                                        'rounded-xl border p-4 text-left transition-all sm:p-5',
                                        isSelected
                                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                                      )}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-base font-medium">{preset.display.name}</p>
                                          <p className={cn('mt-1 text-sm leading-relaxed', isSelected ? 'text-slate-200' : 'text-slate-500')}>
                                            {preset.display.description}
                                          </p>
                                        </div>
                                        {isSelected && (
                                          <div className="rounded-full border border-white/20 bg-white/10 p-2">
                                            <Check className="h-4 w-4" />
                                          </div>
                                        )}
                                      </div>

                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {presetMeta.map((item) => (
                                          <Badge
                                            key={item}
                                            variant="outline"
                                            className={cn('border-current/20 bg-transparent', isSelected ? 'text-white' : 'text-slate-600')}
                                          >
                                            {item}
                                          </Badge>
                                        ))}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedType === 'AMERICAN' && isSelectedAmericanMultiZone && (
                      <FormField
                        control={form.control}
                        name="american_zone_matches_per_couple"
                        render={({ field }) => (
                          <FormItem className="max-w-xs">
                            <FormLabel className="font-medium text-slate-700">Partidos de zona por pareja</FormLabel>
                            <Select
                              value={field.value ?? String(selectedAmericanZoneMatchesPerCouple)}
                              onValueChange={(value) => {
                                field.onChange(value);
                                handleAmericanZoneMatchesChange(value);
                              }}
                            >
                              <FormControl>
                                <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                  <SelectValue placeholder="Selecciona cuantos partidos" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {AMERICAN_MULTI_ZONE_MATCH_OPTIONS.map((value) => (
                                  <SelectItem key={value} value={String(value)}>
                                    {value} partidos
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-slate-500">
                              En zonas de 3, el sistema usa round robin completo cuando corresponde.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {selectedPreset && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <Info className="mt-0.5 h-5 w-5 text-slate-700" />
                          <div className="space-y-3">
                            <div>
                              <p className="font-medium text-slate-900">{selectedPreset.display.name}</p>
                              <p className="mt-1 text-sm text-slate-600">{selectedPreset.display.description}</p>
                            </div>

                            {selectedPreset.advancementConfig.kind === 'SINGLE' && (
                              <FormField
                                control={form.control}
                                name="single_bracket_advance_count"
                                render={({ field }) => (
                                  <FormItem className="max-w-xs">
                                    <FormLabel className="font-medium text-slate-700">Parejas que avanzan a la llave</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="2"
                                        className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                        value={field.value ?? ''}
                                        onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-slate-500">
                                      Ajusta cuantas parejas pasan a la etapa final.
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {selectedPreset.advancementConfig.kind === 'PER_ZONE_TOP' && (
                              <FormField
                                control={form.control}
                                name="american_couples_per_zone"
                                render={({ field }) => (
                                  <FormItem className="max-w-xs">
                                    <FormLabel className="font-medium text-slate-700">Parejas que pasan por zona</FormLabel>
                                    <Select value={field.value ?? 'ALL'} onValueChange={field.onChange}>
                                      <FormControl>
                                        <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                          <SelectValue placeholder="Selecciona cuantas pasan" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="2">2 por zona</SelectItem>
                                        <SelectItem value="3">3 por zona</SelectItem>
                                        <SelectItem value="ALL">Todas por zona</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormDescription className="text-slate-500">
                                      La llave se arma tomando primero esta cantidad en cada zona.
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {selectedPreset.advancementConfig.kind === 'GOLD_SILVER' && (
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <FormField
                                  control={form.control}
                                  name="gold_count"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium text-slate-700">Copa Oro</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min="0"
                                          className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                          value={field.value ?? ''}
                                          onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="silver_count"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium text-slate-700">Copa Plata</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min="0"
                                          className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                          value={field.value ?? ''}
                                          onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="eliminated_count"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="font-medium text-slate-700">Eliminadas</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min="0"
                                          className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                          value={field.value ?? ''}
                                          onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <Separator className="bg-slate-100" />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">Genero</FormLabel>
                            <FormControl>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                  <SelectValue placeholder="Selecciona genero" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="MALE">Masculino</SelectItem>
                                  <SelectItem value="FEMALE">Femenino</SelectItem>
                                  <SelectItem value="MIXED">Mixto</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="club_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">
                              <Building2 className="mr-1 inline h-4 w-4" />
                              {userRole === 'ORGANIZADOR' ? 'Club principal' : 'Tu club'}
                            </FormLabel>
                            <FormControl>
                              {userRole === 'ORGANIZADOR' ? (
                                <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                                  <SelectTrigger className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900">
                                    <SelectValue placeholder="Selecciona un club" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {clubs.map((club) => (
                                      <SelectItem key={club.id} value={club.id}>
                                        <div className="flex items-center gap-2">
                                          <span>{club.name}</span>
                                          <Badge variant="secondary" className="text-xs">
                                            {club.source === 'owned' ? 'Propio' : 'Organizacion'}
                                          </Badge>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="relative">
                                  <Input value={clubs[0]?.name || ''} disabled className="h-11 border-slate-200/80 bg-slate-50 pr-24" />
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Badge variant="outline" className="text-xs">Asignado</Badge>
                                  </div>
                                </div>
                              )}
                            </FormControl>
                            {userRole === 'ORGANIZADOR' && clubs.length === 0 && (
                              <FormDescription className="text-amber-600">
                                No tenes clubes asociados a tu organizacion.
                              </FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {userRole === 'ORGANIZADOR' && clubs.length > 0 && (
                      <FormField
                        control={form.control}
                        name="extra_club_ids"
                        render={() => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">
                              <Building2 className="mr-1 inline h-4 w-4" />
                              Clubes adicionales
                            </FormLabel>
                            <FormControl>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    role="combobox"
                                    aria-expanded="false"
                                    aria-label="Seleccionar clubes adicionales"
                                    className="inline-flex h-11 w-full items-center justify-between rounded-md border border-slate-200/80 bg-white px-3 py-2 text-left text-sm text-slate-700 ring-offset-background focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
                                  >
                                    <span className="truncate">
                                      {extraClubIds.length === 0
                                        ? 'Sumar clubes relacionados al torneo'
                                        : `${extraClubIds.length} club${extraClubIds.length > 1 ? 'es' : ''} adicional${extraClubIds.length > 1 ? 'es' : ''}`}
                                    </span>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                  <Command>
                                    <CommandInput placeholder="Buscar club..." className="h-9" />
                                    <CommandList>
                                      <CommandEmpty>No se encontraron clubes</CommandEmpty>
                                      <CommandGroup>
                                        {clubs.map((club) => (
                                          <CommandItem
                                            key={club.id}
                                            value={club.name}
                                            onSelect={() => handleToggleExtraClub(club.id)}
                                            className="flex items-center gap-2"
                                          >
                                            <Checkbox
                                              checked={extraClubIds.includes(club.id)}
                                              onCheckedChange={() => handleToggleExtraClub(club.id)}
                                              aria-label={`Seleccionar ${club.name}`}
                                            />
                                            <span className="flex-1">{club.name}</span>
                                            <Badge variant="secondary" className="text-xs">
                                              {club.source === 'owned' ? 'Propio' : 'Organizacion'}
                                            </Badge>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </FormControl>
                            <FormDescription className="text-slate-500">
                              Opcional. Sirve para vincular el torneo a mas de un club.
                            </FormDescription>
                            {selectedExtraClubs.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {selectedExtraClubs.map((club) => (
                                  <Badge key={club.id} variant="outline" className="border-slate-200 bg-white px-2 py-1">
                                    <span className="mr-2">{club.name}</span>
                                    <button
                                      type="button"
                                      aria-label={`Quitar ${club.name}`}
                                      onClick={() => handleToggleExtraClub(club.id)}
                                      className="rounded-sm text-slate-500 hover:bg-slate-100"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>
              )}

              {currentStep === 2 && (
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader className="space-y-2 border-b border-slate-100 p-4 sm:p-6">
                    <CardTitle className="flex items-center gap-3 text-lg font-light text-slate-900 sm:text-xl">
                      <CalendarDays className="h-5 w-5 text-slate-700" />
                      Agenda del torneo
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-500">
                      {isAmericanTournament
                        ? 'Definimos fecha y hora de inicio.'
                        : 'Definimos inicio y fecha estimada de cierre.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 p-4 sm:space-y-8 sm:p-6">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <Info className="mt-0.5 h-5 w-5 text-blue-700" />
                        <div>
                          <p className="font-medium text-blue-900">{TYPE_COPY[selectedType].title}</p>
                          <p className="mt-1 text-sm text-blue-800">
                            {isAmericanTournament
                              ? 'Necesitamos fecha y hora porque este formato se organiza como una sola jornada.'
                              : 'Necesitamos fecha de inicio y una fecha aproximada de finalizacion.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                      <FormField
                        control={form.control}
                        name="start_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">
                              <Calendar className="mr-1 inline h-4 w-4" />
                              Fecha de inicio
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                min={new Date().toISOString().split('T')[0]}
                                className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {isAmericanTournament ? (
                        <FormField
                          control={form.control}
                          name="start_time"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-medium text-slate-700">
                                <Clock className="mr-1 inline h-4 w-4" />
                                Hora de inicio
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="time"
                                  className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription className="text-slate-500">
                                Obligatoria para torneos americanos.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <FormField
                          control={form.control}
                          name="end_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-medium text-slate-700">
                                <Calendar className="mr-1 inline h-4 w-4" />
                                Fecha aproximada de finalizacion
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  min={watchedValues.start_date || new Date().toISOString().split('T')[0]}
                                  className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription className="text-slate-500">
                                Obligatoria para torneos long.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {currentStep === 3 && (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr] xl:gap-6">
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardHeader className="space-y-2 border-b border-slate-100 p-4 sm:p-6">
                      <CardTitle className="flex items-center gap-3 text-lg font-light text-slate-900 sm:text-xl">
                        <Users className="h-5 w-5 text-slate-700" />
                        Cupo, precio por jugador y premio
                      </CardTitle>
                      <CardDescription className="text-sm text-slate-500">
                        Ultimos datos antes de crear el torneo.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 p-4 sm:space-y-8 sm:p-6">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                        <FormField
                          control={form.control}
                          name="max_participants"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-medium text-slate-700">
                                <Users className="mr-1 inline h-4 w-4" />
                                Maximo de parejas
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="2"
                                  max="64"
                                  placeholder="Ej: 16"
                                  className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                  value={field.value ?? ''}
                                  onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                                />
                              </FormControl>
                              <FormDescription className="text-slate-500">
                                Opcional. Si lo dejas vacio, el torneo queda sin tope.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-medium text-slate-700">
                                <Tag className="mr-1 inline h-4 w-4" />
                                Precio por jugador
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  max={MAX_TOURNAMENT_PRICE}
                                  step="1"
                                  placeholder="Ej: 5000"
                                  className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                  value={field.value ?? ''}
                                  onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                                />
                              </FormControl>
                              <FormDescription className="text-slate-500">
                                Opcional. Es el valor final por jugador para jugar el torneo.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="award"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-medium text-slate-700">
                              <Award className="mr-1 inline h-4 w-4" />
                              Premio
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                placeholder="Ej: Trofeos + efectivo"
                                className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription className="text-slate-500">
                              Opcional. Se guarda tal como lo escribas.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {isAmericanTournament && (
                        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                          <FormField
                            control={form.control}
                            name="enable_trust_based_payment_policy"
                            render={({ field }) => (
                              <FormItem className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                  <FormLabel className="flex items-center gap-2 text-base font-medium text-slate-900">
                                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                                    Politica de pago por confianza
                                  </FormLabel>
                                  <FormDescription className="max-w-2xl text-slate-600">
                                    Ofrece efectivo o transferencia. En efectivo, los jugadores con poco historial quedan pendientes; con transferencia suben comprobante y quedan confirmados.
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2">
                                    <Checkbox
                                      id="create-trust-payment-policy"
                                      checked={field.value}
                                      onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                                    />
                                    <label htmlFor="create-trust-payment-policy" className="text-sm font-medium text-slate-800">
                                      Activada
                                    </label>
                                  </div>
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          {watchedValues.enable_trust_based_payment_policy && (
                            <div className="grid gap-4 rounded-xl border border-white bg-white p-4 md:grid-cols-3">
                              <FormField
                                control={form.control}
                                name="transfer_alias"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="font-medium text-slate-700">
                                      <Landmark className="mr-1 inline h-4 w-4" />
                                      Alias
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="alias.del.club"
                                        className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-slate-500">
                                      Se muestra en transferencia.
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="transfer_amount_per_player"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="font-medium text-slate-700">Seña por jugador</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Ej: 7500"
                                        className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                        value={field.value ?? ''}
                                        onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-slate-500">
                                      Seña total de la pareja: {formatCurrency(field.value ? Number(field.value) * 2 : undefined)}.
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="trust_policy_min_played_tournaments"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="font-medium text-slate-700">Inscripciones confirmadas para confiar</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="h-11 border-slate-200/80 bg-white focus:border-slate-900 focus:ring-slate-900"
                                        value={field.value ?? 2}
                                        onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : 0)}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-slate-500">
                                      Menos que esto en efectivo queda pendiente.
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardHeader className="space-y-2 border-b border-slate-100 p-4 sm:p-6">
                      <CardTitle className="text-lg font-light text-slate-900 sm:text-xl">Resumen final</CardTitle>
                      <CardDescription className="text-sm text-slate-500">
                        Revisa todo antes de crear el torneo.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5 p-4 sm:p-6">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Torneo</p>
                        <p className="mt-2 text-base font-medium text-slate-900 sm:text-lg">{watchedValues.name || 'Sin nombre todavia'}</p>
                        <p className="mt-1 text-sm text-slate-600">{watchedValues.description?.trim() || 'Sin descripcion'}</p>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tipo</p>
                          <p className="mt-2 font-medium text-slate-900">{TYPE_COPY[selectedType].title}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Formato</p>
                          <p className="mt-2 font-medium text-slate-900">{selectedPreset?.display.name || 'Sin definir'}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Categoria y genero</p>
                          <p className="mt-2 font-medium text-slate-900">
                            {categoryPreview?.label || 'Sin categoria'} · {watchedValues.gender === 'MALE' ? 'Masculino' : watchedValues.gender === 'FEMALE' ? 'Femenino' : 'Mixto'}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {categoryPreview ? `${categoryPreview.initialScore} pts iniciales` : 'Sin preview de puntaje'}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Club principal</p>
                          <p className="mt-2 font-medium text-slate-900">{selectedClub?.name || 'Sin definir'}</p>
                        </div>
                      </div>

                      {selectedExtraClubs.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Clubes adicionales</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedExtraClubs.map((club) => (
                              <Badge key={club.id} variant="outline" className="border-slate-200 bg-white">
                                {club.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <Separator className="bg-slate-100" />

                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500">Inicio</span>
                          <span className="text-right font-medium text-slate-900">
                            {formatInputDate(watchedValues.start_date)}
                            {isAmericanTournament && watchedValues.start_time ? ` · ${watchedValues.start_time}` : ''}
                          </span>
                        </div>

                        {!isAmericanTournament && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-500">Finalizacion estimada</span>
                            <span className="text-right font-medium text-slate-900">{formatInputDate(watchedValues.end_date || '')}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500">Maximo de parejas</span>
                          <span className="text-right font-medium text-slate-900">{watchedValues.max_participants || 'Sin tope'}</span>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500">Precio por jugador</span>
                          <span className="text-right font-medium text-slate-900">{formatCurrency(watchedValues.price)}</span>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500">Premio</span>
                          <span className="text-right font-medium text-slate-900">{watchedValues.award?.trim() || 'Sin definir'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:mx-0 sm:border-t sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {selectedClub && (
                    <div className="break-words text-sm text-slate-500 sm:text-left">
                      Se crea en <span className="font-medium text-slate-700">{selectedClub.name}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                      <Link href="/tournaments">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Cancelar
                      </Link>
                    </Button>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {currentStep > 1 && (
                        <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={handlePreviousStep}>
                          <ArrowLeft className="mr-2 h-4 w-4" />
                          Volver
                        </Button>
                      )}

                      {currentStep < STEP_TITLES.length ? (
                        <Button type="button" size="lg" className="w-full bg-slate-900 hover:bg-slate-800 sm:w-auto" onClick={() => void handleNextStep()}>
                          Siguiente
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      ) : (
                        <Button type="button" size="lg" className="w-full bg-slate-900 hover:bg-slate-800 sm:w-auto" disabled={isSubmitting} onClick={() => void handleCreateTournament()}>
                          {isSubmitting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creando torneo...
                            </>
                          ) : (
                            <>
                              <Trophy className="mr-2 h-4 w-4" />
                              Crear torneo
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
