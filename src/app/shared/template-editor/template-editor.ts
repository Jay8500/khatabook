import { Component, computed, inject, input, model } from '@angular/core';
import { ConfigService, format } from '../../core/services/config.service';

/** A placeholder an admin can drop into a text, e.g. {product}. From app_settings TEXT_VARIABLES. */
export interface TextVariable {
  key: string;
  label: string;
  sample: string;
}

/** Split a text into plain parts and {variables}, for display with pills. */
export function templateParts(text: string): { text: string; variable?: string }[] {
  return text.split(/(\{\w+\})/g).filter(Boolean).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m ? { text: part, variable: m[1] } : { text: part };
  });
}

/**
 * Text box with tap-to-insert variable chips and a live preview, so admins never type
 * {curly} placeholders by hand.
 */
@Component({
  selector: 'app-template-editor',
  template: `
    <textarea
      #box
      rows="3"
      class="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
      [value]="value()"
      (input)="value.set(box.value)"
    ></textarea>

    @if (variables().length) {
      <p class="mt-3 text-xs font-medium text-muted">{{ config.label('template.insert') }}</p>
      <div class="mt-1.5 flex flex-wrap gap-2">
        @for (v of variables(); track v.key) {
          <button
            type="button"
            class="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-on-primary"
            (click)="insert(box, v.key)"
          >
            + {{ v.label }}
          </button>
        }
      </div>

      <div class="mt-4 rounded-xl border border-dashed border-border bg-background p-3">
        <p class="text-xs font-medium text-muted">{{ config.label('template.preview') }}</p>
        <p class="mt-1 text-sm">{{ preview() }}</p>
      </div>
    }
  `,
})
export class TemplateEditor {
  protected readonly config = inject(ConfigService);

  readonly value = model('');
  readonly variables = input<TextVariable[]>([]);

  protected readonly preview = computed(() =>
    format(this.value(), Object.fromEntries(this.variables().map((v) => [v.key, v.sample]))),
  );

  protected insert(box: HTMLTextAreaElement, key: string): void {
    const token = `{${key}}`;
    const text = this.value();
    const start = box.selectionStart ?? text.length;
    const end = box.selectionEnd ?? text.length;
    // Keep a space between the variable and neighbouring words.
    const before = text.slice(0, start);
    const after = text.slice(end);
    const pre = before && !/\s$/.test(before) ? ' ' : '';
    const post = after && !/^[\s.,!?:;)]/.test(after) ? ' ' : '';
    this.value.set(before + pre + token + post + after);
    const caret = start + pre.length + token.length;
    setTimeout(() => {
      box.focus();
      box.setSelectionRange(caret, caret);
    });
  }
}

/** Variables for a text: TEXT_VARIABLES["<SETTING>.<key>"], else the ones already in the text. */
export function variablesFor(config: ConfigService, id: string, text: string): TextVariable[] {
  const defined = config.get<Record<string, TextVariable[]>>('TEXT_VARIABLES')?.[id];
  if (defined?.length) return defined;
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].map((key) => ({
    key,
    label: key,
    sample: `{${key}}`,
  }));
}
