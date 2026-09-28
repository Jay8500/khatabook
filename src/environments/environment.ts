// Only the Supabase connection lives here. Every other value comes from the
// app_settings table through ConfigService.
export const environment = {
  production: true,
  supabaseUrl: '',
  supabaseAnonKey: '',
};
