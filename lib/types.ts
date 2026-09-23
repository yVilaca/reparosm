export type AccountRole = 'admin' | 'merchant';
export type AccountStatus = 'active' | 'suspended' | 'cancelled';
export type OrderStage =
  'Recebido' | 'Diagnóstico' | 'Aguardando aprovação' | 'Em reparo' | 'Teste final' | 'Retirada';
export type OrderStatus =
  'Aberto' | 'Pendente' | 'Aguardando pagamento' | 'Concluído' | 'Cancelado';
export type OrderPriority = 'Normal' | 'Urgente' | 'Garantia';
export type QuoteStatus = 'Aguardando' | 'Aprovado' | 'Recusado';
export type ClientStatus = 'Novo' | 'Em atendimento' | 'Aguardando' | 'Concluído' | 'Inativo';

export type DataObject = { [key: string]: unknown };

export interface AccountData extends DataObject {
  username: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  passwordHash: string;
  mustChangePassword?: boolean;
  createdAt: string;
  plan?: string;
  dueDate?: string;
  accessPolicy?: string;
  passwordResetAt?: string;
  updatedAt?: string;
}

export interface Account extends AccountData {
  id: string;
}

export interface PublicAccount extends DataObject {
  id: string;
  username: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  mustChangePassword?: boolean;
  createdAt: string;
  plan?: string;
  dueDate?: string;
  accessPolicy?: string;
  updatedAt?: string;
}

export interface PasswordRequest {
  id: string;
  accountId: string;
  username: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

export interface Order extends DataObject {
  _accountId?: string;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface Quote extends DataObject {
  _accountId?: string;
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
  _accountId?: string;
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
  _accountId?: string;
  brand: string;
  model: string;
  compatible: string;
  size?: string;
}

export interface Client extends DataObject {
  _accountId?: string;
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
  _accountId?: string;
  description: string;
  reference?: string;
  value: number;
  method?: string;
  date?: string;
  createdAt?: string;
}

export interface Expense extends DataObject {
  _accountId?: string;
  description: string;
  reference?: string;
  value: number;
  method?: string;
  date?: string;
  createdAt?: string;
}

export interface Automation extends DataObject {
  _accountId?: string;
  name: string;
  schedule: string;
  message: string;
  enabled: boolean;
}

export interface Message extends DataObject {
  _accountId?: string;
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
  _accountId?: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  createdAt?: string;
}

export interface Shop extends DataObject {
  _accountId?: string;
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
