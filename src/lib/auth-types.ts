export interface User {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface Session {
  user?: User;
  expires?: string;
}

export interface DefaultSession extends Session {}

export interface Account {
  provider: string;
  type: string;
  providerAccountId: string;
  access_token?: string;
  expires_at?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface Profile {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface NextAuthOptions {
  providers: any[];
  secret?: string;
  session?: {
    strategy?: "jwt" | "database";
    maxAge?: number;
  };
  callbacks?: {
    session?: (params: { session: Session; token: any; user: any }) => Promise<Session> | Session;
    jwt?: (params: { token: any; user?: any; account?: any; profile?: any }) => Promise<any> | any;
  };
}
