/**
 * Helper to resolve all email addresses associated with a user.
 * The CRM login email may differ from the email used in external tools
 * (e.g., Fathom call recordings use a work email like mike.paulus@shipday.com
 * while the CRM login might be mike@mikegrowsgreens.com).
 *
 * The user's work_email is stored in crm.users.settings JSONB.
 */

import { queryOne } from './db';

interface UserEmailsResult {
  /** All unique emails for this user (login + work) */
  all: string[];
  /** The CRM login email */
  login: string;
  /** The work/linked email (from user settings), or null */
  work: string | null;
}

/**
 * Get all emails associated with a user.
 * Returns login email + work_email from crm.users.settings if set.
 */
export async function getUserEmails(userId: number, loginEmail: string): Promise<UserEmailsResult> {
  let workEmail: string | null = null;
  try {
    const row = await queryOne<{ settings: { work_email?: string } }>(
      `SELECT settings FROM crm.users WHERE user_id = $1`,
      [userId]
    );
    workEmail = row?.settings?.work_email || null;
  } catch {
    // settings column may not exist yet
  }
  const emails = [loginEmail];
  if (workEmail && workEmail !== loginEmail) {
    emails.push(workEmail);
  }

  return { all: emails, login: loginEmail, work: workEmail };
}

/**
 * Build a SQL clause that matches any of the user's emails against a column.
 * Returns { clause, params } where clause is like `column = ANY($N::text[])`
 * and params is the array to add to the query params.
 */
export function buildEmailMatchClause(
  emails: string[],
  paramIndex: number,
  columnName: string
): { clause: string; params: [string[]] } {
  return {
    clause: `${columnName} = ANY($${paramIndex}::text[])`,
    params: [emails],
  };
}
