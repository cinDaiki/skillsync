import { explainJobMatch } from './jobMatchEvidence.js';

/** Load current evidence; upgrade a legacy cache once, without estimating any score.
 * The client is injected so the full request sequence can be tested offline.
 */
export async function loadCurrentJobMatchEvidence(client, jobId, eligibility) {
  const unavailable = error => ({ eligibility, calculation: null, evidenceError: error });
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return unavailable(authError || new Error('Authentication required'));
    const { data: row, error: rowError } = await client.from('job_matches').select('*')
      .eq('user_id', user.id).eq('job_id', jobId).maybeSingle();
    if (rowError) return unavailable(rowError);
    if (row?.match_score === eligibility.match_score && explainJobMatch(row.match_calculation, row.match_score)) {
      return { eligibility, calculation: row.match_calculation, evidenceError: null };
    }

    // A fresh legacy score can lack evidence even when the old freshness check passes.
    // The server must calculate and persist the explanation; never rebuild it in JS.
    const { data: result, error: calculationError } = await client.rpc('compute_and_save_job_match', { p_job_id: jobId });
    if (calculationError) return unavailable(calculationError);
    if (!explainJobMatch(result?.match_calculation, result?.match_score)) {
      return unavailable(new Error('Calculation details have not been saved by the server.'));
    }
    // Re-read eligibility rather than deriving eligibility rules in the browser.
    const { data: refreshed, error: refreshError } = await client.rpc('get_job_application_eligibility', { p_job_id: jobId });
    if (refreshError) return unavailable(refreshError);
    if (refreshed?.match_score !== result.match_score) {
      return { eligibility: refreshed || eligibility, calculation: null, evidenceError: new Error('The match changed while its calculation was loading. Please retry.') };
    }
    return { eligibility: refreshed, calculation: result.match_calculation, evidenceError: null };
  } catch (error) {
    return unavailable(error);
  }
}
