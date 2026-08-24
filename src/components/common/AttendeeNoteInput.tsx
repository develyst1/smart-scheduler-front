"use client";

import { Textarea } from "@mantine/core";
import { useT } from "@/lib/i18n";

/** The BE's own limit (`validation.ts` `attendeeNote`), mirrored so staff are told before the server refuses. */
export const ATTENDEE_NOTE_MAX = 200;

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Shown while a per-session save is in flight. */
  disabled?: boolean;
}

/**
 * REQ-068 — "who is actually bringing the child, and the logistics for this session".
 *
 * Two things it is deliberately NOT: it is not the status `note` (the cancel/leave flows own that one and it
 * carries their reasons), and it is not a place for personal data — the hint says so, because a free-text box on a
 * child's booking is exactly where a phone number or a medical detail ends up if nobody says otherwise.
 */
export default function AttendeeNoteInput({ value, onChange, disabled }: Props) {
  const t = useT();
  const over = value.length > ATTENDEE_NOTE_MAX;
  return (
    <Textarea
      label={t("attendeeNote.label")}
      description={t("attendeeNote.hint")}
      placeholder={t("attendeeNote.placeholder")}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
      autosize
      minRows={2}
      maxRows={4}
      // The counter is the affordance; `maxLength` alone would silently swallow the 201st character.
      error={over ? t("attendeeNote.tooLong", { max: ATTENDEE_NOTE_MAX }) : undefined}
      inputWrapperOrder={["label", "description", "input", "error"]}
      rightSectionPointerEvents="none"
      styles={{ input: { paddingRight: 64 } }}
      rightSection={
        <span className={`text-xs tabular-nums ${over ? "text-danger-600" : "text-muted-500"}`}>
          {value.length}/{ATTENDEE_NOTE_MAX}
        </span>
      }
    />
  );
}
