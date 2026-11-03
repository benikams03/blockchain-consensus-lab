export const FUSION_MODEL = 'atelier-fusion-4.1.0';
export const isFusionModel = (v: unknown): v is string => v === FUSION_MODEL || v === 'atelier-fusion-4.0.0';
