/**
 * GET /api/conditions
 *
 * Reads the latest conditions from KV and returns as JSON.
 * The cron worker populates this data every 15 minutes.
 */

export async function onRequest(context) {
  const { env } = context;

  try {
    const data = await env.SURF_DATA.get('conditions', { type: 'json' });

    if (!data) {
      return new Response(JSON.stringify({
        error: 'No conditions data available yet. The cron worker may not have run.',
        hint: 'Trigger the cron worker manually or wait for the next scheduled run.',
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120', // cache for 2 min at edge
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
