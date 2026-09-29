export type Permissions = Record<string, boolean>;

export interface UserProfile {
  id: string;
  phone: string | null;
  username: string | null;
  role_id: string | null;
  shop_id: string | null;
  preferences: Record<string, unknown>;
}

export interface Shop {
  id: string;
  name: string;
  owner_user_id: string;
  subscription_plan_id: string | null;
  subscription_expires_at: string | null;
}

export interface UserContext {
  profile: UserProfile;
  role: { id: string | null; name: string | null; permissions: Permissions };
  shop: Shop | null;
}

/** Error returned inside an encrypt-rpc response. */
export interface RpcError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export type Row = Record<string, unknown>;
