export type MetricAlias = {
  vendor: string;
  alias: string;
  metric: string;
};

export const ALIASES: MetricAlias[] = [
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierHeartRate', metric: 'heart_rate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierRestingHeartRate', metric: 'resting_heart_rate' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierStepCount', metric: 'step_count' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierDistanceWalkingRunning', metric: 'distance_walking_running' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierActiveEnergyBurned', metric: 'active_energy_burned' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBasalEnergyBurned', metric: 'basal_energy_burned' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBodyMass', metric: 'body_mass' },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierSleepAnalysis', metric: 'sleep_analysis' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierOxygenSaturation', metric: 'oxygen_saturation' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBloodPressureSystolic', metric: 'blood_pressure_systolic' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBloodPressureDiastolic', metric: 'blood_pressure_diastolic' }
];
