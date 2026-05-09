'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type {
  EquipmentInput,
  EquipmentRecord,
  SoilType,
  ClimateZone,
} from '@/types';

const SOILS: SoilType[] = ['loam', 'clay', 'sand', 'silt', 'peat', 'chernozem'];
const CLIMATES: ClimateZone[] = [
  'temperate',
  'tropical',
  'arid',
  'continental',
  'mediterranean',
];

const SOIL_LABEL: Record<SoilType, string> = {
  loam: '양토 (Loam)',
  clay: '점토 (Clay)',
  sand: '사질토 (Sand)',
  silt: '미사토 (Silt)',
  peat: '이탄토 (Peat)',
  chernozem: '흑토 (Chernozem)',
};
const CLIMATE_LABEL: Record<ClimateZone, string> = {
  temperate: '온대',
  tropical: '열대',
  arid: '건조',
  continental: '대륙성',
  mediterranean: '지중해성',
};

const FullEquipmentSchema = z.object({
  company: z.string().min(1, '제조사 입력'),
  name: z.string().min(1, '모델명 입력'),
  category: z.enum(['tractor', 'harvester', 'plow', 'seeder']),
  price_krw: z
    .union([z.coerce.number().min(0), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  power_hp: z.coerce.number().min(10).max(1500),
  cutting_width_m: z
    .union([z.coerce.number().min(0).max(20), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  width_m: z
    .union([z.coerce.number().min(0).max(10), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  weight_kg: z
    .union([z.coerce.number().min(0).max(100000), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  max_slope_deg: z.coerce.number().min(0).max(45),
  compatible_soils: z
    .array(z.enum(['loam', 'clay', 'sand', 'silt', 'peat', 'chernozem']))
    .min(1, '토양을 1개 이상 선택'),
  compatible_climates: z
    .array(
      z.enum(['temperate', 'tropical', 'arid', 'continental', 'mediterranean']),
    )
    .min(1, '기후를 1개 이상 선택'),
  min_temp_c: z.coerce.number().min(-30).max(40),
  max_temp_c: z.coerce.number().min(-30).max(50),
  target_crops_csv: z.string().optional(),
  certifications_csv: z.string().optional(),
});

type FullForm = z.input<typeof FullEquipmentSchema>;

const DEFAULT_FORM: FullForm = {
  company: '',
  name: '',
  category: 'tractor',
  price_krw: '',
  power_hp: 200,
  cutting_width_m: '',
  width_m: '',
  weight_kg: '',
  max_slope_deg: 10,
  compatible_soils: ['loam'],
  compatible_climates: ['temperate'],
  min_temp_c: -5,
  max_temp_c: 35,
  target_crops_csv: '',
  certifications_csv: '',
};

function recordToForm(r: EquipmentRecord): FullForm {
  return {
    company: r.company ?? '',
    name: r.name,
    category: (r.category ?? 'tractor') as FullForm['category'],
    price_krw: r.price_krw ?? '',
    power_hp: r.power_hp ?? 100,
    cutting_width_m: r.cutting_width_m ?? '',
    width_m: r.width_m ?? '',
    weight_kg: r.weight_kg ?? '',
    max_slope_deg: r.max_slope_deg ?? 10,
    compatible_soils: (r.compatible_soils ?? ['loam']) as SoilType[],
    compatible_climates: (r.compatible_climates ?? [
      'temperate',
    ]) as ClimateZone[],
    min_temp_c: r.min_temp_c ?? -5,
    max_temp_c: r.max_temp_c ?? 35,
    target_crops_csv: (r.target_crops ?? []).join(', '),
    certifications_csv: (r.certifications ?? []).join(', '),
  };
}

interface Props {
  onMatch: (input: EquipmentInput) => void;
  loading: boolean;
}

export function EquipmentForm({ onMatch, loading }: Props) {
  const [list, setList] = useState<EquipmentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
    getValues,
  } = useForm<FullForm>({
    resolver: zodResolver(FullEquipmentSchema) as never,
    defaultValues: DEFAULT_FORM,
  });

  async function loadList() {
    const res = await fetch('/api/equipment');
    const json = await res.json();
    if (Array.isArray(json.equipment)) {
      setList(json.equipment);
      // Auto-select first model if nothing selected yet
      if (!selectedId && json.equipment.length > 0) {
        const first = json.equipment[0] as EquipmentRecord;
        setSelectedId(first.id);
        reset(recordToForm(first));
      }
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  function onSelect(id: string) {
    setSelectedId(id);
    setSaveMsg(null);
    if (id === '__new__') {
      reset(DEFAULT_FORM);
      return;
    }
    const rec = list.find((r) => r.id === id);
    if (rec) reset(recordToForm(rec));
  }

  async function onMatchSubmit(values: FullForm) {
    onMatch({
      category: values.category,
      power_hp: Number(values.power_hp),
      max_slope_deg: Number(values.max_slope_deg),
      compatible_soils: values.compatible_soils as SoilType[],
      compatible_climates: values.compatible_climates as ClimateZone[],
      min_temp_c: Number(values.min_temp_c),
      max_temp_c: Number(values.max_temp_c),
    });
  }

  async function onSaveModel() {
    setSaveMsg(null);
    const values = getValues();
    if (!values.company || !values.name) {
      setSaveMsg('제조사와 모델명을 먼저 입력해줘.');
      return;
    }
    setSaving(true);
    try {
      const target_crops = (values.target_crops_csv ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const certifications = (values.certifications_csv ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: values.company,
          name: values.name,
          category: values.category,
          price_krw: values.price_krw === '' ? null : Number(values.price_krw),
          power_hp: Number(values.power_hp),
          cutting_width_m:
            values.cutting_width_m === ''
              ? null
              : Number(values.cutting_width_m),
          width_m: values.width_m === '' ? null : Number(values.width_m),
          weight_kg:
            values.weight_kg === '' ? null : Number(values.weight_kg),
          max_slope_deg: Number(values.max_slope_deg),
          compatible_soils: values.compatible_soils,
          compatible_climates: values.compatible_climates,
          min_temp_c: Number(values.min_temp_c),
          max_temp_c: Number(values.max_temp_c),
          target_crops,
          certifications,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveMsg(json.error ?? '저장 실패');
      } else {
        setSaveMsg(`✓ ${json.equipment.company} ${json.equipment.name} 저장됨`);
        await loadList();
        setSelectedId(json.equipment.id);
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onMatchSubmit as never)} className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-400">
          저장된 모델
        </label>
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          {list.map((r) => (
            <option key={r.id} value={r.id}>
              {r.company} {r.name}
              {r.power_hp ? ` · ${r.power_hp}HP` : ''}
            </option>
          ))}
          <option value="__new__">+ 새 모델 등록…</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="제조사" error={errors.company?.message}>
          <input
            {...register('company')}
            placeholder="John Deere"
            className="input"
          />
        </Field>
        <Field label="모델명" error={errors.name?.message}>
          <input {...register('name')} placeholder="9R" className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="카테고리" error={errors.category?.message}>
          <select {...register('category')} className="input">
            <option value="tractor">트랙터</option>
            <option value="harvester">하베스터</option>
            <option value="plow">플로우</option>
            <option value="seeder">시더</option>
          </select>
        </Field>
        <Field label="단가 (원)" error={errors.price_krw?.message}>
          <input
            type="number"
            {...register('price_krw')}
            placeholder="850000000"
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="출력 (HP) *" error={errors.power_hp?.message}>
          <input type="number" {...register('power_hp')} className="input" />
        </Field>
        <Field label="최대 등판각 (°) *" error={errors.max_slope_deg?.message}>
          <input
            type="number"
            step="0.5"
            {...register('max_slope_deg')}
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="예취폭 (m)" error={errors.cutting_width_m?.message}>
          <input
            type="number"
            step="0.1"
            {...register('cutting_width_m')}
            className="input"
          />
        </Field>
        <Field label="차폭 (m)" error={errors.width_m?.message}>
          <input
            type="number"
            step="0.01"
            {...register('width_m')}
            className="input"
          />
        </Field>
        <Field label="중량 (kg)" error={errors.weight_kg?.message}>
          <input
            type="number"
            {...register('weight_kg')}
            className="input"
          />
        </Field>
      </div>

      <Field label="호환 토양 *" error={errors.compatible_soils?.message}>
        <Controller
          name="compatible_soils"
          control={control}
          render={({ field }) => (
            <CheckboxGrid
              options={SOILS}
              labels={SOIL_LABEL}
              value={field.value as SoilType[]}
              onChange={field.onChange}
            />
          )}
        />
      </Field>

      <Field label="호환 기후 *" error={errors.compatible_climates?.message}>
        <Controller
          name="compatible_climates"
          control={control}
          render={({ field }) => (
            <CheckboxGrid
              options={CLIMATES}
              labels={CLIMATE_LABEL}
              value={field.value as ClimateZone[]}
              onChange={field.onChange}
            />
          )}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="최소 온도 (℃) *" error={errors.min_temp_c?.message}>
          <input
            type="number"
            step="0.5"
            {...register('min_temp_c')}
            className="input"
          />
        </Field>
        <Field label="최대 온도 (℃) *" error={errors.max_temp_c?.message}>
          <input
            type="number"
            step="0.5"
            {...register('max_temp_c')}
            className="input"
          />
        </Field>
      </div>

      <Field label="적합 작목 (콤마 구분)">
        <input
          {...register('target_crops_csv')}
          placeholder="corn, soy, wheat"
          className="input"
        />
      </Field>

      <Field label="보유 인증 (콤마 구분)">
        <input
          {...register('certifications_csv')}
          placeholder="EPA Tier 4, CE, EU Stage V"
          className="input"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSaveModel}
          disabled={saving || loading}
          className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '저장 중…' : '모델 저장'}
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {loading ? '매칭 중…' : '매칭하기'}
        </button>
      </div>

      {saveMsg && (
        <p
          className={`rounded-md border px-3 py-2 text-xs ${
            saveMsg.startsWith('✓')
              ? 'border-emerald-700 bg-emerald-950 text-emerald-300'
              : 'border-amber-700 bg-amber-950 text-amber-300'
          }`}
        >
          {saveMsg}
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-zinc-500">
        * 표시는 매칭에 사용되는 필수 필드. 단가·중량·인증 등은 메타데이터로
        저장됩니다 (현재 매칭 로직은 토양/기후/경사/온도만 사용).
      </p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

function CheckboxGrid<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (next: T[]) => void;
}) {
  const toggle = (opt: T) => {
    onChange(
      value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt],
    );
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => toggle(opt)}
            className={`rounded-md border px-2 py-1.5 text-left text-xs transition ${
              checked
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
            }`}
          >
            {labels[opt]}
          </button>
        );
      })}
    </div>
  );
}
