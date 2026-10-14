/**
 * Staff test entry authorization follows the existing test-case designation
 * administrator allowlist rather than granting every staff account permission
 * to create KPI-excluded cases. Staff identity is verified by the existing
 * auth middleware before calling this function.
 */
export function mayCreateTestSurveyCase(
  staffEmail: string | undefined,
  authorizedTestCaseAdmins: ReadonlySet<string>,
): boolean {
  if (!staffEmail || !staffEmail.trim()) return false;
  return authorizedTestCaseAdmins.has(staffEmail.trim().toLowerCase());
}
