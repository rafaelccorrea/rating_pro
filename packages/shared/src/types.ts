import type {
  LeadStatus,
  OrderStatus,
  PersonType,
  ProfileStatus,
  RatingGrade,
  RiskLevel,
  UserRole,
} from './domain';
import type { RatingFactor } from './rating';

/**
 * Formato das linhas retornadas pela API. Segue camelCase — o NestJS converte
 * o snake_case do Postgres antes de responder.
 */

export interface Profile {
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
}

export interface Client {
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
}

export interface Rating {
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

export interface OrderDocument {
  id: string;
  orderId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  actorId: string | null;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  eventType: string;
  note: string | null;
  createdAt: string;
}

/** Linha da view `order_details`: pedido + cliente + revendedor + rating. */
export interface OrderDetails {
  id: string;
  code: string;
  status: OrderStatus;
  resellerId: string;
  clientId: string;
  assignedTo: string | null;
  saleAmount: number;
  commissionAmount: number;
  resellerNotes: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;

  clientName: string;
  clientDocument: string;
  clientPersonType: PersonType;
  clientEmail: string | null;
  clientPhone: string | null;
  clientCity: string | null;
  clientState: string | null;

  resellerName: string;
  resellerEmail: string;
  assignedToName: string | null;

  ratingId: string | null;
  ratingScore: number | null;
  ratingGrade: RatingGrade | null;
  ratingRisk: RiskLevel | null;
  ratingSummary: string | null;
  ratingFactors: RatingFactor[] | null;
  ratingValidUntil: string | null;
  ratingIssuedAt: string | null;
  ratingReportPath: string | null;

  documentsCount: number;
}

export interface Lead {
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
  updatedAt: string;
}

export interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  rejectedOrders: number;
  totalSales: number;
  totalCommission: number;
  avgScore: number | null;
  /** Presentes apenas para master. */
  totalResellers?: number;
  activeResellers?: number;
  newLeads?: number;
}

/**
 * Payload do link público de acompanhamento.
 *
 * Deliberadamente enxuto: qualquer pessoa com o link vê isto. Não expõe valor
 * da venda, comissão, notas internas, nem dados do revendedor além do nome —
 * e o documento vem parcialmente oculto.
 */
export interface TrackingInfo {
  code: string;
  status: OrderStatus;
  /** Nome do avaliado. */
  clientName: string;
  /** Já mascarado pelo backend: `***.***.247-25`. */
  clientDocumentMasked: string;
  clientPersonType: PersonType;
  createdAt: string;
  submittedAt: string | null;
  deliveredAt: string | null;
  /** Motivo, só quando recusado. */
  rejectionReason: string | null;
  /** Presente apenas quando o rating já foi emitido. */
  rating: {
    score: number;
    grade: RatingGrade;
    risk: RiskLevel;
    summary: string | null;
    validUntil: string;
    issuedAt: string;
  } | null;
  /** Marcos do processo, sem identificar quem executou cada passo. */
  timeline: Array<{
    status: OrderStatus;
    at: string;
  }>;
  brandName: string;
}

/** Resposta de `POST /auth/login` e `POST /auth/signup`. */
export interface AuthSession {
  token: string;
  /** ISO 8601. O frontend descarta a sessão localmente quando expira. */
  expiresAt: string;
  profile: Profile;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  /** Erros por campo, quando a falha veio da validacao zod. */
  errors?: Record<string, string[]>;
}
