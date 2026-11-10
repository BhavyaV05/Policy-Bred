# Data dictionary

Generated from `src/content/dictionary.ts` (also downloadable from the dashboard, Export tab).

General conventions: timestamps are UTC ISO-8601; booleans are exported as 1/0; blank cells mean "not answered / not applicable". Participants are never excluded automatically (including those who fail manipulation checks): filter on `is_complete`, `majority_recall_correct` etc. yourself.

## policy_long.csv

| Variable | Type | Description | Coding |
|---|---|---|---|
| `participant_id` | uuid | Anonymous participant identifier. Unique per participant; links every file. |  |
| `is_complete` | boolean 0/1 | Whether the participant submitted the whole study. | 1 = completed (submission_status = completed); 0 = incomplete |
| `submission_status` | text | Participant status label. | in_progress; completed; declined_consent; ineligible_age; withdrawn; started |
| `experimental_group` | integer | Assigned 2x2 condition (assigned once by the server). | 1 = positive framing + majority support; 2 = positive + majority opposition; 3 = negative + support; 4 = negative + opposition |
| `framing_condition` | text | Framing factor. | positive; negative |
| `majority_condition` | text | Perceived majority-opinion factor. | support; opposition |
| `framing_positive` | integer | Numeric framing indicator. | 1 = positive framing; 0 = negative framing |
| `majority_support` | integer | Numeric majority indicator. | 1 = majority support; 0 = majority opposition |
| `is_test` | boolean 0/1 | Researcher test run. Excluded from exports unless you tick "include test sessions". | 1 = test; 0 = real participant |
| `policy_id` | integer | Policy identifier. | 1 = Compulsory TA tutorials; 2 = Strict examination leave policy; 3 = Continuous assessment; 4 = Late-start university schedule; 5 = Non-vegetarian food availability across all messes |
| `policy_name` | text | Short policy name. | tutorials; exam_leave; continuous_assessment; late_start; nonveg_food |
| `position_in_order` | integer 1-5 | Position of this policy in the participant's randomised order (same order in pre-test, manipulation and post-test). |  |
| `policy_order` | text | Participant's full policy order as policy ids separated by "-". | e.g. 3-1-5-2-4 |
| `pre_support` | integer 1-7 | Pre-test support rating. | 1 strongly oppose; 2 oppose; 3 somewhat oppose; 4 neither; 5 somewhat support; 6 support; 7 strongly support |
| `post_support` | integer 1-7 | Post-test support rating (same scale as pre_support). |  |
| `change_in_support` | integer -6..6 | MAIN OUTCOME = post_support - pre_support. | positive = increased support; negative = decreased; 0 = no change |
| `pre_confidence` | integer 1-7 | Pre-test confidence in opinion (optional; blank if skipped). | 1 not at all confident ... 7 extremely confident |
| `pre_familiarity` | integer 1-5 | Pre-test familiarity with the issue (optional; blank if skipped). | 1 not at all familiar ... 5 extremely familiar |
| `pre_recorded_at / post_recorded_at` | timestamp (UTC) | When each rating was saved. |  |
| `exposure_timestamp` | timestamp (UTC) | When the participant first saw the manipulation block for this policy. |  |
| `exposure_completed` | boolean 0/1 | Whether the participant continued past the manipulation block. |  |
| `framing_text_shown / majority_text_shown` | text | Exact wording shown to this participant for this policy. |  |
| `content_version` | text | Version of the policy / manipulation wording used. |  |
| `(note)` |  | Each participant contributes five rows. These repeated measures are NOT independent: analyse with participant as a random effect, or average change within participant (see participants_wide.csv mean_change_all_policies). |  |

## participants_wide.csv

| Variable | Type | Description | Coding |
|---|---|---|---|
| `participant_id` | uuid | Anonymous participant identifier. Unique per participant; links every file. |  |
| `is_complete` | boolean 0/1 | Whether the participant submitted the whole study. | 1 = completed (submission_status = completed); 0 = incomplete |
| `submission_status` | text | Participant status label. | in_progress; completed; declined_consent; ineligible_age; withdrawn; started |
| `experimental_group` | integer | Assigned 2x2 condition (assigned once by the server). | 1 = positive framing + majority support; 2 = positive + majority opposition; 3 = negative + support; 4 = negative + opposition |
| `framing_condition` | text | Framing factor. | positive; negative |
| `majority_condition` | text | Perceived majority-opinion factor. | support; opposition |
| `framing_positive` | integer | Numeric framing indicator. | 1 = positive framing; 0 = negative framing |
| `majority_support` | integer | Numeric majority indicator. | 1 = majority support; 0 = majority opposition |
| `is_test` | boolean 0/1 | Researcher test run flag. |  |
| `p{n}_pre_support / p{n}_post_support / p{n}_change` | integer | For policy n (1-5): pre rating, post rating, and post - pre. | Same 1-7 coding as policy_long.csv |
| `p{n}_pre_confidence / p{n}_pre_familiarity` | integer | Optional pre-test confidence (1-7) and familiarity (1-5) for policy n. |  |
| `p{n}_position_in_order` | integer 1-5 | Position of policy n in this participant's order. |  |
| `mean_change_all_policies` | decimal | Mean of the five change scores for the participant (one value per participant: suitable for a 2x2 between-subjects ANOVA on framing x majority). |  |
| `policy_order` | text | Policy ids in presentation order, separated by "-". |  |
| `started_at, consented_at, demographics_completed_at, assigned_at, completed_at` | timestamp (UTC) | Step timestamps. |  |
| `total_minutes` | decimal | Minutes from start to completion (completed participants only). |  |
| `content_version` | text | Wording version. |  |
| `consent_read_understood / consent_voluntary / consent_age_18 / consent_given` | boolean 0/1 | Consent answers. consent_given = 1 only if all three were yes. |  |
| `age` | integer | Age in years (18+). |  |
| `gender` | text | Gender. | woman; man; non_binary; self_describe; prefer_not_to_say; blank = skipped |
| `gender_self_description` | text | Optional free text if gender = self_describe. |  |
| `year_of_study` | text | Current year of study. | 1; 2; 3; 4; 5; other |
| `degree_programme` | text | Degree/programme. | btech; dual_degree; mtech; ms; phd; other |
| `mess_usage` | text | Regular use of mess facilities. | daily; several_times_week; occasionally; never |
| `mess_crowding` | text | Frequency of mess crowding (asked only if mess_usage is not "never"). | never; rarely; sometimes; often; very_often |
| `tutorial_attendance` | text | Attendance at TA-led tutorials. | always; often; sometimes; rarely; never |
| `tutorial_usefulness` | integer 1-7 | Usefulness of TA-led tutorials (optional). | 1 not at all useful ... 7 extremely useful |
| `study_hours_daily` | text | Daily hours of academic work outside classes. | below_1; 1_2; 2_4; 4_6; more_than_6 |
| `academic_workload` | text | Perceived workload. | very_light; light; moderate; heavy; very_heavy |
| `missed_exam` | text | Ever missed a mid/end-semester exam. | yes; no; prefer_not_to_say |
| `requested_accommodation` | text | Ever requested academic leave / exam accommodation. | yes; no; prefer_not_to_say |
| `wake_time` | text | Usual weekday wake-up time. | before_6am; 6_7am; 7_8am; 8_9am; after_9am |
| `sleep_time` | text | Usual weekday bedtime. | before_10pm; 10_11pm; 11pm_12am; 12_1am; after_1am |
| `dietary_preference` | text | Dietary preference. | vegetarian; non_vegetarian; eggetarian; vegan; other; prefer_not_to_say |
| `mess_food_satisfaction` | integer 1-7 | Satisfaction with mess food-option availability. | 1 very dissatisfied ... 7 very satisfied; blank + mess_food_satisfaction_na = 1 means Not applicable |
| `mess_food_satisfaction_na` | boolean 0/1 | Participant ticked "Not applicable". |  |
| `circles_answer / triangles_answer / squares_answer / game_attempts / game_completion_status` | integer / text | Distraction task final answers and attempts. DESCRIPTIVE ONLY: never an outcome variable. | game_completion_status: completed_correct; completed_max_attempts |
| `final_confidence` | integer 1-7 | Post-test confidence in final opinions. | 1 not at all confident ... 7 extremely confident |
| `reconsideration_response` | text | Did the information make you reconsider? | yes_several; yes_one; no_unchanged; unsure |
| `most_influential_factor` | text | Self-reported most influential factor. | policy_presentation; others_opinions; personal_preferences; combination; none |
| `optional_comment` | text | Optional free-text comment from the debrief page. |  |
| `perceived_framing` | integer 1-7 | Manipulation check: how positively/negatively the information was presented. | 1 very negatively ... 7 very positively |
| `recalled_majority_opinion` | text | Manipulation check: recalled majority opinion. | supported; opposed; unclear; dont_remember |
| `majority_recall_correct` | integer 0/1 | Derived: 1 if recalled_majority_opinion matches the assigned majority_condition. Participants are NOT excluded automatically. | 1 correct recall; 0 otherwise; blank = checks not answered |
| `perceived_social_influence / perceived_framing_influence` | integer 1-7 | Manipulation checks: influence of others' opinions / of presentation. | 1 not at all ... 7 to a very great extent |
| `reconsideration_check` | text | Manipulation check: reconsidered initial preferences? | yes_significantly; yes_some_extent; no; unsure |

## participants.csv

| Variable | Type | Description | Coding |
|---|---|---|---|
| `(all columns)` |  | Participant-level file: same variables as participants_wide.csv except the per-policy p{n}_* columns. |  |

## allocation.csv

| Variable | Type | Description | Coding |
|---|---|---|---|
| `experimental_group, framing_condition, majority_condition` |  | The four conditions (see coding above). |  |
| `target_n` | integer | Target participants for the condition (editable in the conditions table). |  |
| `assigned_total / completed / in_progress` | integer | Assigned participants (non-test) overall, completed, and still in progress. |  |

## distraction_task.csv

| Variable | Type | Description | Coding |
|---|---|---|---|
| `circles_answer, triangles_answer, squares_answer` | integer | Final counts entered by the participant. |  |
| `circles_correct, triangles_correct, squares_correct` | integer | Correct counts for the fixed image. |  |
| `all_correct, attempts, completion_status` |  | Whether final answers were all correct; attempts used (max 3); completion label. |  |
| `answer_history` | json | Every attempt with timestamp. |  |

## all_responses.csv

| Variable | Type | Description | Coding |
|---|---|---|---|
| `section` | text | Where the answer comes from. | participant; policy_rating_pre; policy_rating_post; exposure; distraction_game; posttest_supplementary; manipulation_checks |
| `policy_id, item, response, recorded_at` |  | Tidy key-value form: one row per stored answer (item = variable name). |  |

