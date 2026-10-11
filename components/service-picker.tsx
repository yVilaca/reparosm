import {
  BatteryMedium,
  BrushCleaning,
  Camera,
  Check,
  Mic,
  PanelBottomDashed,
  PlugZap,
  Pointer,
  Settings,
  Smartphone,
  Stethoscope,
  ToggleRight,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { commonServices, type ServiceChoice } from '@/lib/order-services';

const icons: Record<(typeof commonServices)[number], LucideIcon> = {
  'Troca de tela': Smartphone,
  'Troca de bateria': BatteryMedium,
  'Conector de carga': PlugZap,
  Software: Settings,
  Câmera: Camera,
  'Alto-falante': Volume2,
  Microfone: Mic,
  Botões: ToggleRight,
  Touch: Pointer,
  'Tampa traseira': PanelBottomDashed,
  Limpeza: BrushCleaning,
  Diagnóstico: Stethoscope,
};

/**
 * Quadrados dos serviços mais comuns (vários de uma vez) e um campo para o que
 * não estiver na lista. As colunas seguem a largura de onde a grade está.
 */
export default function ServicePicker({
  id,
  value,
  onChange,
  required = false,
}: {
  id: string;
  value: ServiceChoice;
  onChange: (value: ServiceChoice) => void;
  required?: boolean;
}) {
  const toggle = (service: string) =>
    onChange({
      ...value,
      selected: value.selected.includes(service)
        ? value.selected.filter((item) => item !== service)
        : [...value.selected, service],
    });
  return (
    <div className="@container grid gap-3">
      <p className="text-sm leading-none font-medium" id={`${id}-label`}>
        Serviços a realizar{required && ' *'}
      </p>
      <div
        aria-labelledby={`${id}-label`}
        className="grid grid-cols-3 gap-2 @md:grid-cols-4 @xl:grid-cols-6"
        role="group"
      >
        {commonServices.map((service) => {
          const Icon = icons[service];
          const selected = value.selected.includes(service);
          return (
            <button
              aria-pressed={selected}
              className={cn(
                'relative flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-2.5 text-center text-xs leading-tight transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                selected
                  ? 'border-primary bg-primary/5 font-medium text-foreground'
                  : 'border-border bg-background text-foreground/80 hover:border-foreground/25 hover:bg-muted/50',
              )}
              key={service}
              onClick={() => toggle(service)}
              type="button"
            >
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
              <Icon
                aria-hidden="true"
                className={cn('size-5', selected ? 'text-primary' : 'text-muted-foreground')}
              />
              {service}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-other`}>Outro serviço</Label>
        <Input
          id={`${id}-other`}
          onChange={(event) => onChange({ ...value, other: event.target.value })}
          placeholder="Ex.: troca do flex de botões"
          value={value.other}
        />
      </div>
    </div>
  );
}
