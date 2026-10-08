import { industries } from '@shared/statuses';
import { useI18n } from '@/i18n';
import { valueLabel } from '@/lib/labels';

// Suggestions for the industry field. Values stay Japanese (they drive classification);
// the label shows the current language.
export const IndustryOptions = ({ id }: { id: string }) => {
  useI18n();
  return (
    <datalist id={id}>
      {industries.map(i => (
        <option key={i} value={i} label={valueLabel(i) !== i ? valueLabel(i) : undefined} />
      ))}
    </datalist>
  );
};
