/**
 * Demo data for the Users page until wallet-core has a users API.
 * Replace with a GraphQL query (+ MSW handler) when the contract exists.
 */
export interface DemoUser {
  id: string;
  email: string;
  name: string;
  kycStatus: 'pending' | 'approved' | 'rejected' | 'not_started';
  createdAt: string;
}

export const demoUsers: DemoUser[] = [
  {
    id: '1',
    email: 'olena@example.com',
    name: 'Olena K.',
    kycStatus: 'approved',
    createdAt: '2026-10-01',
  },
  {
    id: '2',
    email: 'piotr@example.com',
    name: 'Piotr W.',
    kycStatus: 'pending',
    createdAt: '2026-10-03',
  },
  {
    id: '3',
    email: 'anna@example.com',
    name: 'Anna N.',
    kycStatus: 'rejected',
    createdAt: '2026-10-07',
  },
  {
    id: '4',
    email: 'taras@example.com',
    name: 'Taras S.',
    kycStatus: 'not_started',
    createdAt: '2026-10-12',
  },
  {
    id: '5',
    email: 'marta@example.com',
    name: 'Marta Z.',
    kycStatus: 'approved',
    createdAt: '2026-10-20',
  },
];
