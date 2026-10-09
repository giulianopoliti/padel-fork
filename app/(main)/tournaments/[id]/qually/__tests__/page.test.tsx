import { renderToStaticMarkup } from 'react-dom/server';
import QuallyPage from '../page';
import QuallyView from '../components/QuallyView';
import { createClient } from '@/utils/supabase/server';

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/tournament-permissions', () => ({
  checkTournamentAccess: jest.fn().mockResolvedValue({ accessLevel: 'VIEW_ONLY', metadata: {} }),
}));
jest.mock('@/utils/tournament-visibility', () => ({ canViewTournamentParticipantPages: () => true }));
jest.mock('../components/QuallyView', () => ({ __esModule: true, default: jest.fn(() => null) }));

const mockClient = (result: { data: unknown[] | null; error: { code: string; message: string } | null }) => {
  const inscriptionsQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
  };
  const tournamentQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: 'tournament', type: 'LONG', enable_public_inscriptions: true }, error: null }),
  };
  jest.mocked(createClient).mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    from: jest.fn((table: string) => table === 'tournaments' ? tournamentQuery : inscriptionsQuery),
  } as never);
  return inscriptionsQuery;
};

describe('Qually public inscriptions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loads public data without requesting restricted contact columns', async () => {
    const query = mockClient({ data: [], error: null });
    const page = await QuallyPage({ params: Promise.resolve({ id: 'tournament' }) });
    expect(page.type).toBe(QuallyView);
    expect(page.props.coupleInscriptions).toEqual([]);
    expect(query.select.mock.calls[0][0]).not.toMatch(/\b(phone|dni)\b/);
  });

  it('shows a loading error instead of passing null inscriptions to the view', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockClient({ data: null, error: { code: '42501', message: 'permission denied for table players' } });
    const page = await QuallyPage({ params: Promise.resolve({ id: 'tournament' }) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('No pudimos cargar las parejas inscritas');
    expect(markup).not.toContain('permission denied');
  });
});
