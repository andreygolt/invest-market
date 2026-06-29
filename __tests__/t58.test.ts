import * as React from 'react';
import { NextRequest } from 'next/server';
import { GET as getCatalog } from '@/app/api/investor/catalog/route';
import { ApplyForm } from '@/app/(investor)/deals/[id]/apply/apply-form';
import { TermsForm } from '@/app/(admin)/admin/commercial-terms/terms-form';
import { getSettings, settingAsNumber, DEFAULT_SETTINGS } from '@/lib/settings/get-settings';
import type { CatalogResponse, CommercialTermsRow } from '@/types';

const mockSelectSettings = jest.fn();
const mockGetAuthUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockRange = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterRefresh = jest.fn();
const mockRouterBack = jest.fn();
const mockClientGetUser = jest.fn();

type QueryResult = { data: unknown[] | null; error: { message: string } | null; count: number | null };
type CatalogQuery = PromiseLike<QueryResult> & {
  eq: jest.Mock<CatalogQuery, [string, string]>;
  or: jest.Mock<CatalogQuery, [string]>;
  order: jest.Mock<CatalogQuery, [string, { ascending: boolean; nullsFirst?: boolean }]>;
  range: jest.Mock<CatalogQuery, [number, number]>;
};

jest.mock('react', () => {
  const actual = jest.requireActual<typeof React>('react');
  return {
    ...actual,
    useState: jest.fn(actual.useState),
  };
});

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
    back: mockRouterBack,
  })),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetAuthUser,
    },
    from: mockServerFrom,
  })),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockClientGetUser,
    },
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockAdminFrom,
  })),
}));

function makeCatalogQuery(isCount: boolean): CatalogQuery {
  const query: CatalogQuery = {
    eq: jest.fn(() => query),
    or: jest.fn(() => query),
    order: jest.fn(() => query),
    range: jest.fn((from: number, to: number) => {
      mockRange(from, to);
      return query;
    }),
    then: (resolve, reject) =>
      Promise.resolve({
        data: isCount ? null : [],
        error: null,
        count: isCount ? 0 : null,
      }).then(resolve, reject),
  };
  return query;
}

function setupAdmin() {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'platform_settings') {
      return { select: mockSelectSettings };
    }

    if (table === 'v_investor_catalog') {
      return {
        select: jest.fn((_columns: string, options?: { count?: string; head?: boolean }) =>
          makeCatalogQuery(options?.head === true)
        ),
      };
    }

    return { select: jest.fn() };
  });
}

function mockUseStateValues(values: unknown[], setters: jest.Mock[]) {
  const useStateMock = React.useState as jest.Mock;
  values.forEach((value, index) => {
    useStateMock.mockImplementationOnce(() => [value, setters[index] ?? jest.fn()]);
  });
}

function findElementByType(
  element: React.ReactNode,
  type: string
): React.ReactElement<{ onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void }> | null {
  if (!React.isValidElement(element)) {
    return null;
  }

  if (element.type === type) {
    return element as React.ReactElement<{
      onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
    }>;
  }

  const props = element.props as { children?: React.ReactNode };
  for (const child of React.Children.toArray(props.children)) {
    const result = findElementByType(child, type);
    if (result) return result;
  }

  return null;
}

async function submitForm(element: React.ReactElement) {
  const form = findElementByType(element, 'form');
  expect(form?.props.onSubmit).toBeDefined();
  await form?.props.onSubmit?.({
    preventDefault: jest.fn(),
  } as unknown as React.FormEvent<HTMLFormElement>);
}

describe('T58 getSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (React.useState as jest.Mock).mockReset();
    setupAdmin();
  });

  it('returns DEFAULT_SETTINGS when table is empty', async () => {
    mockSelectSettings.mockResolvedValue({ data: [], error: null });

    const result = await getSettings();

    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('merges DB values with defaults', async () => {
    mockSelectSettings.mockResolvedValue({
      data: [
        { key: 'catalog_page_size', value: '24' },
        { key: 'success_fee_default', value: '7' },
      ],
      error: null,
    });

    const result = await getSettings();

    expect(result.catalog_page_size).toBe('24');
    expect(result.success_fee_default).toBe('7');
    expect(result.platform_name).toBe(DEFAULT_SETTINGS.platform_name);
  });

  it('returns DEFAULT_SETTINGS on DB error', async () => {
    mockSelectSettings.mockResolvedValue({ data: null, error: { message: 'db error' } });

    const result = await getSettings();

    expect(result).toEqual(DEFAULT_SETTINGS);
  });
});

describe('T58 settingAsNumber', () => {
  it('parses number correctly', () => {
    expect(settingAsNumber(DEFAULT_SETTINGS, 'catalog_page_size', 12)).toBe(12);
  });

  it('returns fallback for NaN', () => {
    const settings = { ...DEFAULT_SETTINGS, catalog_page_size: 'abc' };

    expect(settingAsNumber(settings, 'catalog_page_size', 99)).toBe(99);
  });

  it('returns fallback for zero', () => {
    const settings = { ...DEFAULT_SETTINGS, catalog_page_size: '0' };

    expect(settingAsNumber(settings, 'catalog_page_size', 12)).toBe(12);
  });
});

describe('T58 investor catalog settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (React.useState as jest.Mock).mockReset();
    mockGetAuthUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    setupAdmin();
  });

  it('uses catalog_page_size from settings', async () => {
    mockSelectSettings.mockResolvedValue({
      data: [{ key: 'catalog_page_size', value: '24' }],
      error: null,
    });

    const response = await getCatalog(new NextRequest('http://localhost/api/investor/catalog'));
    const body = (await response.json()) as CatalogResponse;

    expect(body.per_page).toBe(24);
    expect(mockRange).toHaveBeenCalledWith(0, 23);
  });

  it('gives query per_page priority over settings', async () => {
    mockSelectSettings.mockResolvedValue({
      data: [{ key: 'catalog_page_size', value: '24' }],
      error: null,
    });

    const response = await getCatalog(new NextRequest('http://localhost/api/investor/catalog?per_page=10'));
    const body = (await response.json()) as CatalogResponse;

    expect(body.per_page).toBe(10);
    expect(mockRange).toHaveBeenCalledWith(0, 9);
  });

  it('caps settings per_page at 50', async () => {
    mockSelectSettings.mockResolvedValue({
      data: [{ key: 'catalog_page_size', value: '100' }],
      error: null,
    });

    const response = await getCatalog(new NextRequest('http://localhost/api/investor/catalog'));
    const body = (await response.json()) as CatalogResponse;

    expect(body.per_page).toBe(50);
    expect(mockRange).toHaveBeenCalledWith(0, 49);
  });
});

describe('T58 ApplyForm amount validation', () => {
  const setLoading = jest.fn();
  const setError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (React.useState as jest.Mock).mockReset();
    mockClientGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;
  });

  it('validates minimum amount', async () => {
    mockUseStateValues(['500', 'Готов обсудить проект', false, null], [
      jest.fn(),
      jest.fn(),
      setLoading,
      setError,
    ]);

    const element = ApplyForm({
      projectId: 'project-1',
      projectName: 'Project',
      investmentAsk: null,
      minAmount: 1000,
      maxAmount: 5000,
    });
    await submitForm(element);

    expect(setError).toHaveBeenCalledWith('Минимальная сумма заявки — 1 000 ₽');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('validates maximum amount', async () => {
    mockUseStateValues(['6000', 'Готов обсудить проект', false, null], [
      jest.fn(),
      jest.fn(),
      setLoading,
      setError,
    ]);

    const element = ApplyForm({
      projectId: 'project-1',
      projectName: 'Project',
      investmentAsk: null,
      minAmount: 1000,
      maxAmount: 5000,
    });
    await submitForm(element);

    expect(setError).toHaveBeenCalledWith('Максимальная сумма заявки — 5 000 ₽');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('accepts amount in valid range', async () => {
    mockUseStateValues(['3000', 'Готов обсудить проект', false, null], [
      jest.fn(),
      jest.fn(),
      setLoading,
      setError,
    ]);

    const element = ApplyForm({
      projectId: 'project-1',
      projectName: 'Project',
      investmentAsk: null,
      minAmount: 1000,
      maxAmount: 5000,
    });
    await submitForm(element);

    expect(setError).not.toHaveBeenCalledWith(expect.stringContaining('сумма заявки'));
    expect(global.fetch).toHaveBeenCalledWith('/api/investor/applications', expect.any(Object));
  });

  it('allows empty amount', async () => {
    mockUseStateValues(['', 'Готов обсудить проект', false, null], [
      jest.fn(),
      jest.fn(),
      setLoading,
      setError,
    ]);

    const element = ApplyForm({
      projectId: 'project-1',
      projectName: 'Project',
      investmentAsk: null,
      minAmount: 1000,
      maxAmount: 5000,
    });
    await submitForm(element);

    expect(setError).not.toHaveBeenCalledWith(expect.stringContaining('сумма заявки'));
    expect(global.fetch).toHaveBeenCalledWith('/api/investor/applications', expect.any(Object));
  });
});

describe('T58 TermsForm default success fee', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (React.useState as jest.Mock).mockReset();
  });

  function renderTermsForm(terms: CommercialTermsRow | null, defaultSuccessFee: number) {
    const initialValues: unknown[] = [];
    (React.useState as jest.Mock).mockImplementation((initialValue: unknown) => {
      initialValues.push(initialValue);
      return [initialValue, jest.fn()];
    });

    TermsForm({ projectId: 'project-1', terms, defaultSuccessFee });

    return initialValues;
  }

  it('initializes with defaultSuccessFee when terms is null', () => {
    const initialValues = renderTermsForm(null, 8);

    expect(initialValues[3]).toBe('8');
  });

  it('uses terms.success_fee_pct when terms exist', () => {
    const terms: CommercialTermsRow = {
      id: 'terms-1',
      project_id: 'project-1',
      success_fee_pct: 6,
      fixed_fee: 0,
      notes: null,
      created_by: 'admin-1',
      created_at: '2026-06-28T00:00:00Z',
      updated_at: '2026-06-28T00:00:00Z',
    };
    const initialValues = renderTermsForm(terms, 8);

    expect(initialValues[3]).toBe('6');
  });
});
