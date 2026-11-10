// Questionnaire content (participant-facing wording). The stored codes (`value`) must match the
// check constraints / validation in supabase/migrations.

export interface Option { value: string; label: string }

export const SUPPORT_LABELS = [
  'Strongly oppose', 'Oppose', 'Somewhat oppose', 'Neither support nor oppose',
  'Somewhat support', 'Support', 'Strongly support',
]

export type DemoQuestion =
  | { id: string; kind: 'number'; label: string; required: true; min: number; max: number }
  | { id: string; kind: 'radio'; label: string; required: boolean; options: Option[]; showIf?: (a: Record<string, any>) => boolean }
  | { id: string; kind: 'scale7'; label: string; required: boolean; low: string; high: string; naId?: string }

export interface DemoGroup { id: string; title: string; blurb: string; questions: DemoQuestion[] }

const yesNoPns: Option[] = [
  { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

export const DEMOGRAPHIC_GROUPS: DemoGroup[] = [
  {
    id: 'A', title: 'About you', blurb: 'A few basic details. We do not collect your name or any contact information.',
    questions: [
      { id: 'age', kind: 'number', label: 'What is your age?', required: true, min: 0, max: 120 },
      {
        id: 'gender', kind: 'radio', label: 'What is your gender?', required: false,
        options: [
          { value: 'woman', label: 'Woman' }, { value: 'man', label: 'Man' }, { value: 'non_binary', label: 'Non-binary' },
          { value: 'self_describe', label: 'Prefer to self-describe' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' },
        ],
      },
      {
        id: 'year_of_study', kind: 'radio', label: 'What is your current year of study?', required: true,
        options: [
          { value: '1', label: '1st' }, { value: '2', label: '2nd' }, { value: '3', label: '3rd' },
          { value: '4', label: '4th' }, { value: '5', label: '5th' }, { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'degree_programme', kind: 'radio', label: 'What is your degree/programme?', required: true,
        options: [
          { value: 'btech', label: 'B.Tech' }, { value: 'dual_degree', label: 'Dual Degree' }, { value: 'mtech', label: 'M.Tech' },
          { value: 'ms', label: 'MS' }, { value: 'phd', label: 'PhD' }, { value: 'other', label: 'Other' },
        ],
      },
    ],
  },
  {
    id: 'B', title: 'Living and mess use', blurb: 'Your day-to-day campus routine.',
    questions: [
      {
        id: 'mess_usage', kind: 'radio', label: 'Do you regularly use university mess facilities?', required: true,
        options: [
          { value: 'daily', label: 'Daily' }, { value: 'several_times_week', label: 'Several times a week' },
          { value: 'occasionally', label: 'Occasionally' }, { value: 'never', label: 'Never' },
        ],
      },
      {
        id: 'mess_crowding', kind: 'radio', label: 'How frequently do you experience crowding at university messes?', required: false,
        showIf: (a) => a.mess_usage && a.mess_usage !== 'never',
        options: [
          { value: 'never', label: 'Never' }, { value: 'rarely', label: 'Rarely' }, { value: 'sometimes', label: 'Sometimes' },
          { value: 'often', label: 'Often' }, { value: 'very_often', label: 'Very often' },
        ],
      },
    ],
  },
  {
    id: 'C', title: 'Academic background', blurb: 'How you study and attend classes.',
    questions: [
      {
        id: 'tutorial_attendance', kind: 'radio', label: 'How frequently do you attend TA-led tutorials?', required: true,
        options: [
          { value: 'always', label: 'Always' }, { value: 'often', label: 'Often' }, { value: 'sometimes', label: 'Sometimes' },
          { value: 'rarely', label: 'Rarely' }, { value: 'never', label: 'Never' },
        ],
      },
      { id: 'tutorial_usefulness', kind: 'scale7', label: 'How useful do you find TA-led tutorials?', required: false, low: 'Not at all useful', high: 'Extremely useful' },
      {
        id: 'study_hours_daily', kind: 'radio', required: false,
        label: 'Approximately how many hours do you spend on academic work daily outside scheduled classes?',
        options: [
          { value: 'below_1', label: 'Below 1' }, { value: '1_2', label: '1-2' }, { value: '2_4', label: '2-4' },
          { value: '4_6', label: '4-6' }, { value: 'more_than_6', label: 'More than 6' },
        ],
      },
      {
        id: 'academic_workload', kind: 'radio', label: 'How would you describe your current academic workload?', required: false,
        options: [
          { value: 'very_light', label: 'Very light' }, { value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' },
          { value: 'heavy', label: 'Heavy' }, { value: 'very_heavy', label: 'Very heavy' },
        ],
      },
      { id: 'missed_exam', kind: 'radio', label: 'Have you ever missed a mid-semester or end-semester examination?', required: false, options: yesNoPns },
      {
        id: 'requested_accommodation', kind: 'radio', required: false,
        label: 'Have you ever had to request academic leave or an examination-related accommodation?', options: yesNoPns,
      },
    ],
  },
  {
    id: 'D', title: 'Daily routine', blurb: 'Your usual weekday schedule.',
    questions: [
      {
        id: 'wake_time', kind: 'radio', label: 'What time do you usually wake up on weekdays?', required: false,
        options: [
          { value: 'before_6am', label: 'Before 6 AM' }, { value: '6_7am', label: '6-7 AM' }, { value: '7_8am', label: '7-8 AM' },
          { value: '8_9am', label: '8-9 AM' }, { value: 'after_9am', label: 'After 9 AM' },
        ],
      },
      {
        id: 'sleep_time', kind: 'radio', label: 'What time do you usually go to sleep on weekdays?', required: false,
        options: [
          { value: 'before_10pm', label: 'Before 10 PM' }, { value: '10_11pm', label: '10-11 PM' },
          { value: '11pm_12am', label: '11 PM-12 AM' }, { value: '12_1am', label: '12-1 AM' }, { value: 'after_1am', label: 'After 1 AM' },
        ],
      },
    ],
  },
  {
    id: 'E', title: 'Food and mess preferences', blurb: 'Last set of background questions.',
    questions: [
      {
        id: 'dietary_preference', kind: 'radio', label: 'Which best describes your dietary preference?', required: false,
        options: [
          { value: 'vegetarian', label: 'Vegetarian' }, { value: 'non_vegetarian', label: 'Non-vegetarian' },
          { value: 'eggetarian', label: 'Eggetarian' }, { value: 'vegan', label: 'Vegan' },
          { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' },
        ],
      },
      {
        id: 'mess_food_satisfaction', kind: 'scale7', required: false, naId: 'mess_food_satisfaction_na',
        label: 'How satisfied are you with the current availability of food options in university messes?',
        low: 'Very dissatisfied', high: 'Very satisfied',
      },
    ],
  },
]

// ---- Post-test supplementary ----------------------------------------------------------
export const RECONSIDERATION_OPTIONS: Option[] = [
  { value: 'yes_several', label: 'Yes, on several policies.' },
  { value: 'yes_one', label: 'Yes, on one policy.' },
  { value: 'no_unchanged', label: 'No, my opinions remained largely unchanged.' },
  { value: 'unsure', label: 'Unsure.' },
]
export const FACTOR_OPTIONS: Option[] = [
  { value: 'policy_presentation', label: 'The advantages or disadvantages described in the policy presentation.' },
  { value: 'others_opinions', label: "The information about other students' opinions." },
  { value: 'personal_preferences', label: 'My existing personal preferences.' },
  { value: 'combination', label: 'A combination of these factors.' },
  { value: 'none', label: 'None of these.' },
]

// ---- Manipulation checks --------------------------------------------------------------
export const FRAMING_CHECK_LABELS = [
  'Very negatively', 'Negatively', 'Somewhat negatively', 'Neither positively nor negatively',
  'Somewhat positively', 'Positively', 'Very positively',
]
export const MAJORITY_RECALL_OPTIONS: Option[] = [
  { value: 'supported', label: 'Most students supported the proposed policies.' },
  { value: 'opposed', label: 'Most students opposed the proposed policies.' },
  { value: 'unclear', label: 'The information was unclear.' },
  { value: 'dont_remember', label: 'I do not remember.' },
]
export const RECONSIDER_CHECK_OPTIONS: Option[] = [
  { value: 'yes_significantly', label: 'Yes, significantly.' },
  { value: 'yes_some_extent', label: 'Yes, to some extent.' },
  { value: 'no', label: 'No.' },
  { value: 'unsure', label: 'Unsure.' },
]
