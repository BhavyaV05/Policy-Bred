-- =====================================================================
-- Study content (version v1.0). All wording shown to participants for
-- the policies, framings and majority statements is stored here so the
-- exact text is recorded with each participant's exposure.
-- To change wording after launch, INSERT a new content_version rather
-- than editing in place, and update study_config 'content_version'.
-- =====================================================================

insert into public.study_config (key, value) values
  ('content_version', 'v1.0'),
  ('stale_assignment_hours', '4');
-- stale_assignment_hours: an assigned participant who has not completed within this
-- many hours stops counting towards their condition quota (so abandoned sessions do
-- not permanently use up slots). Their own condition never changes if they return.

insert into public.conditions (experimental_condition, framing_condition, majority_condition, target_n) values
  (1, 'positive', 'support',    13),
  (2, 'positive', 'opposition', 13),
  (3, 'negative', 'support',    12),
  (4, 'negative', 'opposition', 12);

-- Distraction task: the fixed arrangement (src/content/gameLayout.json) contains
-- 12 circles, 11 triangles, 10 squares (and 5 stars as distractors).
insert into public.game_config (id, circles, triangles, squares, max_attempts) values (1, 12, 11, 10, 3);

insert into public.policies (policy_id, short_name, title, description, content_version) values
  (1, 'tutorials', 'Compulsory TA Tutorials',
   $t$All students will be required to attend tutorials conducted by Teaching Assistants (TAs). Attendance at these tutorial sessions will be compulsory throughout the semester.$t$, 'v1.0'),
  (2, 'exam_leave', 'Strict Examination Leave Policy',
   $t$Students who miss a mid-semester or end-semester examination will be required to appear for a compulsory re-examination. No exemption from the re-examination requirement will be provided.$t$, 'v1.0'),
  (3, 'continuous_assessment', 'Continuous Assessment',
   $t$A larger proportion of students' final course grades will be determined through regular quizzes, assignments and assessments conducted throughout the semester, with a reduced weightage for the final examination.$t$, 'v1.0'),
  (4, 'late_start', 'Late-Start University Schedule',
   $t$The university's daily class schedule will be shifted from the existing 8:30 AM-6:30 PM schedule to a later schedule beginning at 11:30 AM and extending until 9:30 PM.$t$, 'v1.0'),
  (5, 'nonveg_food', 'Non-Vegetarian Food Availability Across All Messes',
   $t$Non-vegetarian food options will be made available in all university messes instead of being restricted to selected messes, with the aim of distributing student demand and reducing crowding.$t$, 'v1.0');

insert into public.policy_framing_content (policy_id, framing, framing_text, content_version) values
  (1, 'positive', $t$Compulsory TA tutorials can provide students with regular academic guidance, improve conceptual understanding and create opportunities for personalised doubt clarification.$t$, 'v1.0'),
  (1, 'negative', $t$Compulsory TA tutorials can reduce students' flexibility, restrict independent study time and require attendance even when students feel they can learn independently.$t$, 'v1.0'),
  (2, 'positive', $t$A compulsory re-examination requirement for missed examinations can promote consistent assessment standards, maintain academic discipline and ensure comparable evaluation across students.$t$, 'v1.0'),
  (2, 'negative', $t$A compulsory re-examination requirement can create additional academic pressure, inconvenience students facing emergencies and limit flexibility in exceptional circumstances.$t$, 'v1.0'),
  (3, 'positive', $t$Greater emphasis on continuous assessment can encourage consistent learning, provide regular feedback and reduce dependence on performance in a single final examination.$t$, 'v1.0'),
  (3, 'negative', $t$Greater emphasis on continuous assessment can increase academic workload, create frequent performance pressure and leave students with less time to manage competing commitments.$t$, 'v1.0'),
  (4, 'positive', $t$Starting classes at 11:30 AM can provide students with additional morning time, allow more flexible daily routines and potentially improve rest before academic activities.$t$, 'v1.0'),
  (4, 'negative', $t$Starting classes at 11:30 AM can extend academic commitments into the night, reduce evening flexibility and interfere with extracurricular and personal activities.$t$, 'v1.0'),
  (5, 'positive', $t$Making non-vegetarian food available across all messes can expand meal choices, distribute student demand more evenly and potentially reduce crowding at selected messes.$t$, 'v1.0'),
  (5, 'negative', $t$Making non-vegetarian food available across all messes can increase operational complexity, require additional kitchen arrangements and create challenges in managing food preparation and demand.$t$, 'v1.0');

insert into public.majority_statements (majority_condition, statement_text, content_version) values
  ('support',    $t$Imagine that you are informed that a majority of university students support introducing this policy at their university.$t$, 'v1.0'),
  ('opposition', $t$Imagine that you are informed that a majority of university students oppose introducing this policy at their university.$t$, 'v1.0');
