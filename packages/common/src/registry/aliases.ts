export type MetricAlias = {
  vendor: string;
  alias: string;
  metric: string;
};

export const ALIASES: MetricAlias[] = [
  // === core vitals ===
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
  // === body composition ===
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBodyMass', metric: 'body_mass' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierBodyMassIndex', metric: 'body_mass_index' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierHeight', metric: 'height' },
  // === activity totals ===
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
  // === gait & posture ===
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
  // === running form ===
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
  // === audio exposure ===
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
  // === sleep ===
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
  // === environment / water ===
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierWaterTemperature', metric: 'water_temperature' },
  { vendor: 'apple', alias: 'HKQuantityTypeIdentifierUnderwaterDepth', metric: 'underwater_depth' },
  // === dietary ===
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
  // === apple ring / activity events ===
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierAppleStandHour', metric: 'apple_stand_hour' },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierAudioExposureEvent', metric: 'audio_exposure_event' },
  { vendor: 'apple', alias: 'HKCategoryTypeIdentifierSleepApneaEvent', metric: 'sleep_apnea_event' }
];
