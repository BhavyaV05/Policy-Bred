// Study-level text that must be filled in before launch (via environment variables).
export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  researcherName: (import.meta.env.VITE_RESEARCHER_NAME as string) || "[Researcher's name]",
  supervisor: (import.meta.env.VITE_SUPERVISOR_NAME as string) || "[Supervisor's name and contact details]",
  contactEmail: (import.meta.env.VITE_RESEARCH_CONTACT_EMAIL as string) || '',
  institution: 'International Institute of Information Technology, Hyderabad',
  estimatedMinutes: (import.meta.env.VITE_ESTIMATED_MINUTES as string) || '10-15',
  studyTitle:
    'Framing, Social Conformity, and Policy Support: An Experimental Study of Academic Policy Preferences Among University Students',
}
export const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
