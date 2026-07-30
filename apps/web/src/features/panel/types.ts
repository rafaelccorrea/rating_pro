import type {
  IntakeInput,
  LeadStatus,
  OrderStatus,
  PersonType,
  ProfileStatus,
  RatingFactor,
  RatingGrade,
  RiskLevel,
  UserRole,
} from '@rating-pro/shared';

/**
 * Formato exato do que a API devolve (payloads do Prisma com os includes),
 * que é mais aninhado que a view `order_details` do banco.
 */

export interface ClientRow {
  id: string;
  resellerId: string;
  personType: PersonType;
  document: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { orders: number };
}

export interface RatingRow {
  id: string;
  orderId: string;
  score: number;
  grade: RatingGrade;
  risk: RiskLevel;
  summary: string | null;
  factors: RatingFactor[];
  validUntil: string;
  issuedBy: string;
  issuedAt: string;
  reportPath: string | null;
}

export interface OrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  /** Token do link público de acompanhamento. */
  trackingToken: string;
  resellerId: string;
  clientId: string;
  assignedTo: string | null;
  saleAmount: number;
  commissionAmount: number;
  /** Formulário de coleta PF ou PJ; null enquanto não preenchido. */
  intake: IntakeInput | null;
  resellerNotes: string | null;
  rejectionReason: string | null;
  /** Presente somente para master. */
  internalNotes?: string | null;
  submittedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: ClientRow;
  rating: RatingRow | null;
  reseller: { id: string; fullName: string; email: string };
  assignee: { id: string; fullName: string } | null;
}

export interface OrderEventRow {
  id: string;
  orderId: string;
  actorId: string | null;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  eventType: string;
  note: string | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
}

export interface OrderDocumentRow {
  id: string;
  orderId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

export interface OrderDetailRow extends OrderRow {
  documents: OrderDocumentRow[];
  events: OrderEventRow[];
}

export interface ProfileRow {
  id: string;
  role: UserRole;
  status: ProfileStatus;
  fullName: string;
  email: string;
  phone: string | null;
  document: string | null;
  companyName: string | null;
  city: string | null;
  state: string | null;
  commissionRate: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { orders: number; clients: number };
}

export interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  message: string | null;
  source: string;
  utm: Record<string, string>;
  status: LeadStatus;
  ownerId: string | null;
  createdAt: string;
  owner: { id: string; fullName: string } | null;
}
