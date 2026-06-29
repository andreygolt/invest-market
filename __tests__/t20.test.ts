import CatalogLoading from '@/app/(investor)/catalog/loading';
import PortfolioLoading from '@/app/(investor)/portfolio/loading';
import { Disclaimer, DISCLAIMER_TEXT } from '@/components/disclaimer';
import type { DisclaimerVariant } from '@/types';

describe('T20 Disclaimer', () => {
  it('Disclaimer default renders', () => {
    expect(() => Disclaimer({ variant: 'default' })).not.toThrow();
  });

  it('Disclaimer compact renders', () => {
    expect(() => Disclaimer({ variant: 'compact' })).not.toThrow();
  });

  it('disclaimer text contains "не является"', () => {
    expect(DISCLAIMER_TEXT).toContain('не является');
  });

  it('disclaimer text contains "риском потери"', () => {
    expect(DISCLAIMER_TEXT).toContain('риском потери');
  });

  it('disclaimer text contains "вне платформы"', () => {
    expect(DISCLAIMER_TEXT).toContain('вне платформы');
  });

  it('DisclaimerVariant accepts default and compact', () => {
    const variants: DisclaimerVariant[] = ['default', 'compact'];
    expect(variants).toEqual(['default', 'compact']);
  });
});

describe('T20 loading states', () => {
  it('catalog loading renders', () => {
    expect(() => CatalogLoading()).not.toThrow();
  });

  it('portfolio loading renders', () => {
    expect(() => PortfolioLoading()).not.toThrow();
  });
});
