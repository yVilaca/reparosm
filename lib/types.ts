export type AccountRole = 'admin' | 'merchant';
export type AccountStatus = 'active' | 'suspended' | 'cancelled';
import type { OrderStage } from './order-stages';
export type { OrderStage } from './order-stages';
export type OrderStatus =
  'Aberto' | 'Pendente' | 'Aguardando pagamento' | 'Concluído' | 'Cancelado';
export type OrderPriority = 'Normal' | 'Urgente' | 'Garantia';
export type QuoteStatus = 'Aguardando' | 'Aprovado' | 'Recusado';
export type ClientStatus = 'Novo' | 'Em atendimento' | 'Aguardando' | 'Concluído' | 'Inativo';

export type DataObject = { [key: string]: unknown };

/** A loja: o tenant de todas as tabelas. Quem entra são os usuários dela. */
export interface Account extends DataObject {
  id: string;
  username: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
  plan?: string;
  dueDate?: string;
  accessPolicy?: string;
  updatedAt?: string;
}

export type UserRole = 'owner' | 'staff';
export type UserStatus = 'active' | 'disabled';

/** Uma pessoa com login numa loja: Dono ou Funcionário. */
export interface StoreUser {
  id: string;
  accountId: string;
  username: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  /** E-mail para entrar e recuperar a senha (único no sistema). */
  email?: string;
  /** A pessoa já usou um link recebido nesse e-mail. */
  emailVerified: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Situação do acesso: `ready` já criou a senha; `invited` tem convite valendo;
 * `invite-expired` foi convidada e o convite venceu sem uso.
 */
export type UserAccess = 'ready' | 'invited' | 'invite-expired';

/** Uma pessoa da equipe, com os aparelhos conectados e se pediu senha nova. */
export type TeamMember = StoreUser & {
  sessions: number;
  passwordRequested: boolean;
  access: UserAccess;
};

/**
 * Como um link de acesso chegou: por e-mail (`sent`) ou, sem e-mail ou sem
 * SMTP, como endereço para copiar e mandar à pessoa (WhatsApp).
 */
export type LinkDelivery =
  | { sent: true; to: string }
  | {
      sent: false;
      url: string;
      expiresAt: string;
      reason: 'no-email' | 'not-configured' | 'failed' | 'copy';
    };

/** A loja da sessão e quem está usando. */
export interface SessionAccount extends Account {
  user: StoreUser;
}

export type PublicAccount = SessionAccount;

/** Um aparelho conectado: uma sessão aberta de um usuário. */
export interface StoreSession {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export type OrderPayment = { id: string; value: number; method: string; date: string };

export interface OrderItem extends DataObject {
  partId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
}

/** "Esqueci minha senha" de um usuário, à espera do Dono ou do administrador. */
export interface PasswordRequest {
  id: string;
  userId: string;
  accountId: string;
  username: string;
  name: string;
  storeName: string;
  createdAt: string;
}

export interface Order extends DataObject {
  code: string;
  customer: string;
  phone?: string;
  device: string;
  imei?: string;
  password?: string;
  problem?: string;
  service?: string;
  notes?: string;
  priority?: OrderPriority;
  pattern?: number[];
  labor?: number;
  parts?: number;
  cost?: number;
  total?: number;
  profit?: number;
  stage?: OrderStage;
  status?: OrderStatus;
  whatsappConsent?: boolean;
  quoteId?: string;
  quoteCode?: string;
  technician?: string;
  warrantyDays?: number;
  deliveredAt?: string;
  payment?: OrderPayment | null;
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Quote extends DataObject {
  code?: string;
  customer: string;
  phone: string;
  device: string;
  problem?: string;
  service: string;
  notes?: string;
  labor?: number;
  parts?: number;
  total?: number;
  validUntil?: string;
  status?: QuoteStatus;
  orderId?: string;
  answeredAt?: string;
  createdAt?: string;
}

export interface Part extends DataObject {
  name: string;
  category?: string;
  stock: number;
  cost?: number;
  price: number;
  sku?: string;
  published?: boolean;
  image?: string;
}

export interface Film extends DataObject {
  brand: string;
  model: string;
  compatible: string;
  size?: string;
}

export interface Client extends DataObject {
  name: string;
  phone: string;
  email?: string;
  document?: string;
  address?: string;
  birth?: string;
  status?: ClientStatus;
  vip?: boolean;
  notes?: string;
  lastOrderId?: string;
  lastOrderCode?: string;
  lastDevice?: string;
  automatic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payment extends DataObject {
  description: string;
  reference?: string;
  value: number;
  method?: string;
  date?: string;
  createdAt?: string;
}

export interface Expense extends DataObject {
  description: string;
  reference?: string;
  value: number;
  method?: string;
  date?: string;
  createdAt?: string;
}

export type PayableStatus = 'pending' | 'paid';

export interface Payable extends DataObject {
  description: string;
  supplier?: string;
  category?: string;
  /** 'fixed' é legado e é tratado como despesa. */
  source?: 'purchase' | 'fixed' | 'other';
  recurrence?: 'weekly' | 'monthly' | 'yearly';
  seriesId?: string;
  installmentNumber?: number;
  installmentCount?: number;
  /** Linha digitável do boleto ou chave Pix. */
  paymentCode?: string;
  amount: number;
  dueDate?: string;
  status?: PayableStatus;
  paidAt?: string;
  /** Data de negócio do pagamento (a do caixa). */
  paidOn?: string;
  paidAmount?: number;
  method?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Automation extends DataObject {
  name: string;
  schedule: string;
  message: string;
  enabled: boolean;
}

export interface Message extends DataObject {
  orderId?: string;
  customer: string;
  phone: string;
  kind: string;
  message: string;
  status: string;
  providerId?: string;
  error?: string;
  sentAt?: string;
}

export interface Tutorial extends DataObject {
  title: string;
  url: string;
  category?: string;
  description?: string;
  createdAt?: string;
}

export interface Shop extends DataObject {
  name: string;
  phone: string;
  address?: string;
  cityRegistration?: string;
  diagnosisTime?: string;
  description?: string;
  document?: string;
  email?: string;
  financial?: string;
  footer?: string;
  google?: string;
  hours?: string;
  instagram?: string;
  internalPhone?: string;
  legalName?: string;
  logo?: string;
  showLaborOnPrint?: boolean;
  allowNegativeStock?: boolean;
  customerPrintMessage?: string;
  stateRegistration?: string;
  taxRegime?: string;
  technician?: string;
  terms?: string;
  warranty?: string;
  website?: string;
}

export interface RecordData {
  order: Order;
  quote: Quote;
  part: Part;
  shop: Shop;
  film: Film;
  client: Client;
  payment: Payment;
  expense: Expense;
  automation: Automation;
  message: Message;
  tutorial: Tutorial;
}

export type RecordType = keyof RecordData;
export type BusinessRecordType =
  | 'order'
  | 'quote'
  | 'part'
  | 'shop'
  | 'film'
  | 'client'
  | 'payment'
  | 'expense'
  | 'automation'
  | 'message'
  | 'tutorial';

export type StoredRecord<T extends RecordType = RecordType> = T extends RecordType
  ? {
      id: string;
      type: T;
      data: RecordData[T];
      created_at?: string;
      updated_at?: string;
    }
  : never;
