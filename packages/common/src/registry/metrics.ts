export const REGISTRY_VERSION = 2;

export type ValueKind = 'quantity' | 'category';
export type TemporalKind = 'instant' | 'interval' | 'cumulative';
export type AggregationFn = 'sum' | 'avg' | 'min' | 'max' | 'latest';

export type MetricDefinition = {
  metric: string;
  valueKind: ValueKind;
  temporalKind: TemporalKind;
  canonicalUnit: string | null;
  defaultAgg: AggregationFn;
  allowedAggs: AggregationFn[];
  resolveOverlap: boolean;
};

const ALL: AggregationFn[] = ['avg', 'min', 'max', 'latest'];
const SUM_ONLY: AggregationFn[] = ['sum'];
const SUM_PLUS: AggregationFn[] = ['sum', 'avg', 'min', 'max', 'latest'];

export const METRICS: MetricDefinition[] = [
  // === core vitals ===
  { metric: 'heart_rate', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'count/min', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: true },
  { metric: 'resting_heart_rate', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'count/min', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'walking_heart_rate_average', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'count/min', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'heart_rate_recovery_one_minute', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'count/min', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'heart_rate_variability_sdnn', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'ms', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'respiratory_rate', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'count/min', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'oxygen_saturation', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: '%', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'blood_pressure_systolic', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'mmHg', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'blood_pressure_diastolic', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'mmHg', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  // === body composition ===
  { metric: 'body_mass', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'kg', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'body_mass_index', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'count', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'height', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'cm', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  // === activity totals ===
  { metric: 'step_count', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'count', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: true },
  { metric: 'distance_walking_running', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'km', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: true },
  { metric: 'distance_cycling', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'km', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'distance_swimming', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'm', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'swimming_stroke_count', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'count', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'flights_climbed', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'count', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: true },
  { metric: 'active_energy_burned', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'kcal', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: true },
  { metric: 'basal_energy_burned', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'kcal', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'apple_stand_time', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'min', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: true },
  { metric: 'apple_exercise_time', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'min', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: true },
  { metric: 'time_in_daylight', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'min', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'physical_effort', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'kcal/hr·kg', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  // === gait & posture (walking analysis) ===
  { metric: 'walking_speed', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'km/hr', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'walking_step_length', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'cm', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'walking_double_support_percentage', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: '%', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'walking_asymmetry_percentage', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: '%', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'apple_walking_steadiness', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: '%', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'stair_ascent_speed', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'm/s', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'stair_descent_speed', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'm/s', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'six_minute_walk_test_distance', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'm', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  // === running form ===
  { metric: 'running_speed', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'km/hr', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'running_power', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'W', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'running_stride_length', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'm', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'running_vertical_oscillation', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'cm', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'running_ground_contact_time', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'ms', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'vo2_max', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'mL/min·kg', defaultAgg: 'latest', allowedAggs: ALL, resolveOverlap: false },
  // === audio exposure ===
  { metric: 'environmental_audio_exposure', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'dBASPL', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'headphone_audio_exposure', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'dBASPL', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'environmental_sound_reduction', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'dBASPL', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  // === sleep ===
  { metric: 'sleep_analysis', valueKind: 'category', temporalKind: 'interval', canonicalUnit: null, defaultAgg: 'latest', allowedAggs: ['latest'], resolveOverlap: true },
  { metric: 'apple_sleeping_breathing_disturbances', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'count/min', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'apple_sleeping_wrist_temperature', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'degC', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  // === environment / water ===
  { metric: 'water_temperature', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'degC', defaultAgg: 'avg', allowedAggs: ALL, resolveOverlap: false },
  { metric: 'underwater_depth', valueKind: 'quantity', temporalKind: 'instant', canonicalUnit: 'm', defaultAgg: 'max', allowedAggs: ALL, resolveOverlap: false },
  // === dietary (Lose It! food entries) ===
  { metric: 'dietary_energy_consumed', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'kcal', defaultAgg: 'sum', allowedAggs: SUM_PLUS, resolveOverlap: false },
  { metric: 'dietary_protein', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_carbohydrates', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_fat_total', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_fat_saturated', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_fat_monounsaturated', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_fat_polyunsaturated', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_fiber', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_sugar', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'g', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_cholesterol', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_sodium', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_calcium', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_iron', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_magnesium', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_phosphorus', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_potassium', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_zinc', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_niacin', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_riboflavin', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_thiamin', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_folate', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mcg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_vitamin_a', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mcg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_vitamin_b6', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_vitamin_b12', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mcg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'dietary_vitamin_c', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'mg', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  { metric: 'number_of_alcoholic_beverages', valueKind: 'quantity', temporalKind: 'cumulative', canonicalUnit: 'count', defaultAgg: 'sum', allowedAggs: SUM_ONLY, resolveOverlap: false },
  // === apple ring / activity events ===
  { metric: 'apple_stand_hour', valueKind: 'category', temporalKind: 'interval', canonicalUnit: null, defaultAgg: 'latest', allowedAggs: ['latest'], resolveOverlap: false },
  { metric: 'audio_exposure_event', valueKind: 'category', temporalKind: 'interval', canonicalUnit: null, defaultAgg: 'latest', allowedAggs: ['latest'], resolveOverlap: false },
  { metric: 'sleep_apnea_event', valueKind: 'category', temporalKind: 'interval', canonicalUnit: null, defaultAgg: 'latest', allowedAggs: ['latest'], resolveOverlap: false }
];
