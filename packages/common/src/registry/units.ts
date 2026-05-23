export type UnitConversion = {
  fromUnit: string;
  toUnit: string;
  factor: number;
  offset: number;
};

export const UNIT_CONVERSIONS: UnitConversion[] = [
  { fromUnit: 'count/min', toUnit: 'count/min', factor: 1, offset: 0 },
  { fromUnit: 'count', toUnit: 'count', factor: 1, offset: 0 },
  { fromUnit: 'km', toUnit: 'km', factor: 1, offset: 0 },
  { fromUnit: 'mi', toUnit: 'km', factor: 1.609344, offset: 0 },
  { fromUnit: 'm', toUnit: 'km', factor: 0.001, offset: 0 },
  { fromUnit: 'kcal', toUnit: 'kcal', factor: 1, offset: 0 },
  { fromUnit: 'Cal', toUnit: 'kcal', factor: 1, offset: 0 },
  { fromUnit: 'kg', toUnit: 'kg', factor: 1, offset: 0 },
  { fromUnit: 'lb', toUnit: 'kg', factor: 0.45359237, offset: 0 },
  { fromUnit: '%', toUnit: '%', factor: 1, offset: 0 },
  { fromUnit: 'mmHg', toUnit: 'mmHg', factor: 1, offset: 0 },
  { fromUnit: 'degF', toUnit: 'degC', factor: 0.5555555555555556, offset: -17.77777777777778 },
  { fromUnit: 'degC', toUnit: 'degC', factor: 1, offset: 0 }
];
