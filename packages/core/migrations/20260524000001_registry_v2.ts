// Frozen snapshot of REGISTRY_VERSION = 2.
// v2 expands the registry from 11 to 71 metrics, covering everything observed in real Apple
// Health exports: gait & running form, audio exposure, dietary nutrients, sleep biometrics,
// underwater + water temperature, apple ring categories, etc. Units match Apple's emissions
// (km/hr, m/s, W, dBASPL, mL/min·kg, kcal/hr·kg, ms, g, mg, mcg, min) so no conversion needed.
// Replaces all v1 rows (deletes then inserts).
import type { Knex } from 'knex';

const REGISTRY_VERSION = 2;

const ALL: string[] = ['avg', 'min', 'max', 'latest'];
const SUM_ONLY: string[] = ['sum'];
const SUM_PLUS: string[] = ['sum', 'avg', 'min', 'max', 'latest'];

const METRICS = [
  {
    metric: 'heart_rate',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: true
  },
  {
    metric: 'resting_heart_rate',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'walking_heart_rate_average',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'heart_rate_recovery_one_minute',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'heart_rate_variability_sdnn',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'ms',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'respiratory_rate',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'oxygen_saturation',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: '%',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'blood_pressure_systolic',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'mmHg',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'blood_pressure_diastolic',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'mmHg',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'body_mass',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'kg',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'body_mass_index',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'height',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'cm',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'step_count',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'count',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: true
  },
  {
    metric: 'distance_walking_running',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'km',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: true
  },
  {
    metric: 'distance_cycling',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'km',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'distance_swimming',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'm',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'swimming_stroke_count',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'count',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'flights_climbed',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'count',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: true
  },
  {
    metric: 'active_energy_burned',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'kcal',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: true
  },
  {
    metric: 'basal_energy_burned',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'kcal',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'apple_stand_time',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'min',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: true
  },
  {
    metric: 'apple_exercise_time',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'min',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: true
  },
  {
    metric: 'time_in_daylight',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'min',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'physical_effort',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'kcal/hr·kg',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'walking_speed',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'km/hr',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'walking_step_length',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'cm',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'walking_double_support_percentage',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: '%',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'walking_asymmetry_percentage',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: '%',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'apple_walking_steadiness',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: '%',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'stair_ascent_speed',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'm/s',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'stair_descent_speed',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'm/s',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'six_minute_walk_test_distance',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'm',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'running_speed',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'km/hr',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'running_power',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'W',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'running_stride_length',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'm',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'running_vertical_oscillation',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'cm',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'running_ground_contact_time',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'ms',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'vo2_max',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'mL/min·kg',
    default_agg: 'latest',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'environmental_audio_exposure',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'dBASPL',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'headphone_audio_exposure',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'dBASPL',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'environmental_sound_reduction',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'dBASPL',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'sleep_analysis',
    value_kind: 'category',
    temporal_kind: 'interval',
    canonical_unit: null,
    default_agg: 'latest',
    allowed_aggs: ['latest'],
    resolve_overlap: true
  },
  {
    metric: 'apple_sleeping_breathing_disturbances',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'count/min',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'apple_sleeping_wrist_temperature',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'degC',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'water_temperature',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'degC',
    default_agg: 'avg',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'underwater_depth',
    value_kind: 'quantity',
    temporal_kind: 'instant',
    canonical_unit: 'm',
    default_agg: 'max',
    allowed_aggs: ALL,
    resolve_overlap: false
  },
  {
    metric: 'dietary_energy_consumed',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'kcal',
    default_agg: 'sum',
    allowed_aggs: SUM_PLUS,
    resolve_overlap: false
  },
  {
    metric: 'dietary_protein',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_carbohydrates',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_fat_total',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_fat_saturated',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_fat_monounsaturated',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_fat_polyunsaturated',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_fiber',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_sugar',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'g',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_cholesterol',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_sodium',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_calcium',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_iron',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_magnesium',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_phosphorus',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_potassium',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_zinc',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_niacin',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_riboflavin',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_thiamin',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_folate',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mcg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_vitamin_a',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mcg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_vitamin_b6',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_vitamin_b12',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mcg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'dietary_vitamin_c',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'mg',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'number_of_alcoholic_beverages',
    value_kind: 'quantity',
    temporal_kind: 'cumulative',
    canonical_unit: 'count',
    default_agg: 'sum',
    allowed_aggs: SUM_ONLY,
    resolve_overlap: false
  },
  {
    metric: 'apple_stand_hour',
    value_kind: 'category',
    temporal_kind: 'interval',
    canonical_unit: null,
    default_agg: 'latest',
    allowed_aggs: ['latest'],
    resolve_overlap: false
  },
  {
    metric: 'audio_exposure_event',
    value_kind: 'category',
    temporal_kind: 'interval',
    canonical_unit: null,
    default_agg: 'latest',
    allowed_aggs: ['latest'],
    resolve_overlap: false
  },
  {
    metric: 'sleep_apnea_event',
    value_kind: 'category',
    temporal_kind: 'interval',
    canonical_unit: null,
    default_agg: 'latest',
    allowed_aggs: ['latest'],
    resolve_overlap: false
  }
] as const;

const ALIASES = [
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierHeartRate', metric: 'heart_rate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRestingHeartRate', metric: 'resting_heart_rate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierWalkingHeartRateAverage', metric: 'walking_heart_rate_average' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
    metric: 'heart_rate_recovery_one_minute'
  },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', metric: 'heart_rate_variability_sdnn' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRespiratoryRate', metric: 'respiratory_rate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierOxygenSaturation', metric: 'oxygen_saturation' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBloodPressureSystolic', metric: 'blood_pressure_systolic' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBloodPressureDiastolic', metric: 'blood_pressure_diastolic' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBodyMass', metric: 'body_mass' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBodyMassIndex', metric: 'body_mass_index' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierHeight', metric: 'height' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierStepCount', metric: 'step_count' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDistanceWalkingRunning', metric: 'distance_walking_running' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDistanceCycling', metric: 'distance_cycling' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDistanceSwimming', metric: 'distance_swimming' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierSwimmingStrokeCount', metric: 'swimming_stroke_count' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierFlightsClimbed', metric: 'flights_climbed' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierActiveEnergyBurned', metric: 'active_energy_burned' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBasalEnergyBurned', metric: 'basal_energy_burned' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierAppleStandTime', metric: 'apple_stand_time' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierAppleExerciseTime', metric: 'apple_exercise_time' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierTimeInDaylight', metric: 'time_in_daylight' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierPhysicalEffort', metric: 'physical_effort' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierWalkingSpeed', metric: 'walking_speed' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierWalkingStepLength', metric: 'walking_step_length' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage',
    metric: 'walking_double_support_percentage'
  },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierWalkingAsymmetryPercentage',
    metric: 'walking_asymmetry_percentage'
  },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierAppleWalkingSteadiness', metric: 'apple_walking_steadiness' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierStairAscentSpeed', metric: 'stair_ascent_speed' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierStairDescentSpeed', metric: 'stair_descent_speed' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierSixMinuteWalkTestDistance',
    metric: 'six_minute_walk_test_distance'
  },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRunningSpeed', metric: 'running_speed' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRunningPower', metric: 'running_power' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRunningStrideLength', metric: 'running_stride_length' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierRunningVerticalOscillation',
    metric: 'running_vertical_oscillation'
  },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRunningGroundContactTime', metric: 'running_ground_contact_time' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierVO2Max', metric: 'vo2_max' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierEnvironmentalAudioExposure',
    metric: 'environmental_audio_exposure'
  },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierHeadphoneAudioExposure', metric: 'headphone_audio_exposure' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierEnvironmentalSoundReduction',
    metric: 'environmental_sound_reduction'
  },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierSleepAnalysis', metric: 'sleep_analysis' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances',
    metric: 'apple_sleeping_breathing_disturbances'
  },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
    metric: 'apple_sleeping_wrist_temperature'
  },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierWaterTemperature', metric: 'water_temperature' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierUnderwaterDepth', metric: 'underwater_depth' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', metric: 'dietary_energy_consumed' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryProtein', metric: 'dietary_protein' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryCarbohydrates', metric: 'dietary_carbohydrates' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryFatTotal', metric: 'dietary_fat_total' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryFatSaturated', metric: 'dietary_fat_saturated' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierDietaryFatMonounsaturated',
    metric: 'dietary_fat_monounsaturated'
  },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierDietaryFatPolyunsaturated',
    metric: 'dietary_fat_polyunsaturated'
  },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryFiber', metric: 'dietary_fiber' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietarySugar', metric: 'dietary_sugar' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryCholesterol', metric: 'dietary_cholesterol' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietarySodium', metric: 'dietary_sodium' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryCalcium', metric: 'dietary_calcium' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryIron', metric: 'dietary_iron' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryMagnesium', metric: 'dietary_magnesium' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryPhosphorus', metric: 'dietary_phosphorus' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryPotassium', metric: 'dietary_potassium' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryZinc', metric: 'dietary_zinc' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryNiacin', metric: 'dietary_niacin' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryRiboflavin', metric: 'dietary_riboflavin' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryThiamin', metric: 'dietary_thiamin' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryFolate', metric: 'dietary_folate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryVitaminA', metric: 'dietary_vitamin_a' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryVitaminB6', metric: 'dietary_vitamin_b6' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryVitaminB12', metric: 'dietary_vitamin_b12' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDietaryVitaminC', metric: 'dietary_vitamin_c' },
  {
    vendor: 'apple',
    alias: 'HKQuantityTypeIdentifierNumberOfAlcoholicBeverages',
    metric: 'number_of_alcoholic_beverages'
  },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierAppleStandHour', metric: 'apple_stand_hour' },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierAudioExposureEvent', metric: 'audio_exposure_event' },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierSleepApneaEvent', metric: 'sleep_apnea_event' }
] as const;

const UNIT_CONVERSIONS = [
  { from_unit: 'count/min', to_unit: 'count/min', factor: 1, offset: 0 },
  { from_unit: 'count', to_unit: 'count', factor: 1, offset: 0 },
  { from_unit: 'km', to_unit: 'km', factor: 1, offset: 0 },
  { from_unit: 'mi', to_unit: 'km', factor: 1.609344, offset: 0 },
  { from_unit: 'm', to_unit: 'km', factor: 0.001, offset: 0 },
  { from_unit: 'kcal', to_unit: 'kcal', factor: 1, offset: 0 },
  { from_unit: 'Cal', to_unit: 'kcal', factor: 1, offset: 0 },
  { from_unit: 'kg', to_unit: 'kg', factor: 1, offset: 0 },
  { from_unit: 'lb', to_unit: 'kg', factor: 0.45359237, offset: 0 },
  { from_unit: '%', to_unit: '%', factor: 1, offset: 0 },
  { from_unit: 'mmHg', to_unit: 'mmHg', factor: 1, offset: 0 },
  { from_unit: 'degF', to_unit: 'degC', factor: 0.5555555555555556, offset: -17.77777777777778 },
  { from_unit: 'degC', to_unit: 'degC', factor: 1, offset: 0 }
] as const;

export const up = async (knex: Knex): Promise<void> => {
  await knex('metric_aliases').delete();
  await knex('unit_conversions').delete();
  await knex('metrics_registry').delete();

  await knex('metrics_registry').insert(METRICS.map(m => ({ ...m, registry_version: REGISTRY_VERSION })));
  await knex('metric_aliases').insert(ALIASES.map(a => ({ ...a })));
  await knex('unit_conversions').insert(UNIT_CONVERSIONS.map(u => ({ ...u })));
};

export const down = async (knex: Knex): Promise<void> => {
  await knex('metric_aliases').delete();
  await knex('unit_conversions').delete();
  await knex('metrics_registry').delete();
};
