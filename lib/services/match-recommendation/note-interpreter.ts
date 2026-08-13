import 'server-only'

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { parseAvailabilityNote } from './note-parser'
import { timeToMinutes } from './time'

const aiInterpretationSchema = z.object({
  classification: z.enum(['TIME_CONSTRAINT', 'NO_TIME_CONSTRAINT', 'AMBIGUOUS']),
  earliestStartTime: z.string().nullable(),
  latestEndTime: z.string().nullable(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
})

const getGeminiProvider = () => createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

export interface AvailabilityNoteInterpretation {
  note_interpretation_status: 'NONE' | 'PARSED' | 'PENDING_REVIEW'
  note_interpretation_source: 'DETERMINISTIC' | 'AI' | 'MANUAL' | null
  preferred_start_time: string | null
  preferred_end_time: string | null
  proposed_start_time: string | null
  proposed_end_time: string | null
  interpretation_confidence: number | null
  interpretation_summary: string | null
  interpreted_note_snapshot: string | null
  interpreted_at: string
  reviewed_by: null
  reviewed_at: null
}

const isValidTime = (value: string | null) => value === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

const normalizeProposal = (
  start: string | null,
  end: string | null,
  slotStartTime: string,
  slotEndTime: string,
) => {
  if (!isValidTime(start) || !isValidTime(end)) return { start: null, end: null }
  if (start && timeToMinutes(start) < timeToMinutes(slotStartTime)) return { start: null, end: null }
  if (end && timeToMinutes(end) > timeToMinutes(slotEndTime)) return { start: null, end: null }
  if (start && end && timeToMinutes(start) >= timeToMinutes(end)) return { start: null, end: null }
  return { start, end }
}

export const interpretAvailabilityNote = async (
  note: string | null | undefined,
  slotStartTime: string,
  slotEndTime: string,
): Promise<AvailabilityNoteInterpretation> => {
  const now = new Date().toISOString()
  const trimmedNote = note?.trim() || ''
  const deterministic = parseAvailabilityNote(trimmedNote, slotStartTime, slotEndTime)

  if (deterministic.kind === 'NO_CONSTRAINT') {
    return {
      note_interpretation_status: 'NONE',
      note_interpretation_source: null,
      preferred_start_time: null,
      preferred_end_time: null,
      proposed_start_time: null,
      proposed_end_time: null,
      interpretation_confidence: null,
      interpretation_summary: null,
      interpreted_note_snapshot: null,
      interpreted_at: now,
      reviewed_by: null,
      reviewed_at: null,
    }
  }

  if (deterministic.kind === 'PARSED') {
    const proposal = normalizeProposal(
      deterministic.earliestStartTime,
      deterministic.latestEndTime,
      slotStartTime,
      slotEndTime,
    )
    return {
      note_interpretation_status: 'PARSED',
      note_interpretation_source: 'DETERMINISTIC',
      preferred_start_time: proposal.start,
      preferred_end_time: proposal.end,
      proposed_start_time: null,
      proposed_end_time: null,
      interpretation_confidence: deterministic.confidence,
      interpretation_summary: deterministic.summary,
      interpreted_note_snapshot: trimmedNote,
      interpreted_at: now,
      reviewed_by: null,
      reviewed_at: null,
    }
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      note_interpretation_status: 'PENDING_REVIEW',
      note_interpretation_source: 'MANUAL',
      preferred_start_time: null,
      preferred_end_time: null,
      proposed_start_time: null,
      proposed_end_time: null,
      interpretation_confidence: null,
      interpretation_summary: 'Requiere revision manual; Gemini no esta configurado.',
      interpreted_note_snapshot: trimmedNote,
      interpreted_at: now,
      reviewed_by: null,
      reviewed_at: null,
    }
  }

  try {
    const result = await generateText({
      model: getGeminiProvider()(process.env.GEMINI_NOTE_MODEL || 'gemini-3.5-flash-lite'),
      output: Output.object({ schema: aiInterpretationSchema }),
      prompt: `Interpreta una nota breve de disponibilidad para un partido de padel.
El slot del organizador es ${slotStartTime}-${slotEndTime}.
Nota: ${JSON.stringify(trimmedNote)}

Extrae solamente restricciones horarias razonablemente expresadas por la nota.
Usa formato HH:MM de 24 horas. Usa null cuando no exista un limite.
No inventes horarios ni cambies el slot. Si no hay una lectura clara, clasifica AMBIGUOUS.
La salida es solo una propuesta para revision humana.`,
    })
    const output = result.output
    const proposal = normalizeProposal(
      output.classification === 'TIME_CONSTRAINT' ? output.earliestStartTime : null,
      output.classification === 'TIME_CONSTRAINT' ? output.latestEndTime : null,
      slotStartTime,
      slotEndTime,
    )

    return {
      note_interpretation_status: 'PENDING_REVIEW',
      note_interpretation_source: 'AI',
      preferred_start_time: null,
      preferred_end_time: null,
      proposed_start_time: proposal.start,
      proposed_end_time: proposal.end,
      interpretation_confidence: output.confidence,
      interpretation_summary: output.summary,
      interpreted_note_snapshot: trimmedNote,
      interpreted_at: now,
      reviewed_by: null,
      reviewed_at: null,
    }
  } catch (error) {
    console.error('Availability note interpretation failed:', error)
    return {
      note_interpretation_status: 'PENDING_REVIEW',
      note_interpretation_source: 'MANUAL',
      preferred_start_time: null,
      preferred_end_time: null,
      proposed_start_time: null,
      proposed_end_time: null,
      interpretation_confidence: null,
      interpretation_summary: 'Gemini no pudo interpretar la nota; requiere revision manual.',
      interpreted_note_snapshot: trimmedNote,
      interpreted_at: now,
      reviewed_by: null,
      reviewed_at: null,
    }
  }
}
