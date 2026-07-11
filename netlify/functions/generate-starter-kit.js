// This is the "Communications AI" for Sellable.
// It receives someone's quiz results, asks Claude to write their starter kit,
// then assembles and sends the full results email automatically.
// It runs on Netlify's servers, never in the browser, so the secret keys
// below (ANTHROPIC_API_KEY, RESEND_API_KEY) stay hidden and safe.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { email, firstName, topSkills } = JSON.parse(event.body);

    if (!email || !topSkills || !topSkills.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing email or topSkills' })
      };
    }

    const [first, second, third] = topSkills;
    const greetingName = firstName && firstName.trim() ? firstName.trim() : 'there';

    // ---- STEP 1: Ask Claude to write the starter kit for the #1 skill ----
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: `Someone's top monetizable skill is "${first.name}". Here's why it fits them: ${first.why}

They are a complete beginner to freelancing. Write a short, encouraging starter kit with exactly these three sections, using these exact headers:

SERVICE DESCRIPTION:
(2-3 sentences describing one specific freelance service they could offer, written like it would appear on a simple profile or bio)

SUGGESTED PRICING:
(one realistic beginner-friendly price or price range in USD, plus a one-sentence reason why)

FIRST OUTREACH MESSAGE:
(a short, warm, non-salesy message under 80 words they could send to a friend or former colleague to land their very first client)

Keep the tone warm, plain, and encouraging. No jargon. Do not use markdown symbols like asterisks or hashtags.`
          }
        ]
      })
    });

    const claudeData = await claudeResponse.json();
    const starterKitText =
      claudeData?.content?.[0]?.text ||
      "We had trouble generating your starter kit. Please try again in a moment.";

    // ---- STEP 2: Assemble the full email, combining the results + starter kit ----
    const emailBody = `Hi ${greetingName},

Thanks for taking the Sellable quiz! Based on your answers, your top monetizable skill is:

${first.name}
${first.why}

Your #2 and #3 matches were ${second ? second.name : ''} and ${third ? third.name : ''} — worth knowing about too, since skills often work well together.

Here's your personalized starter kit for ${first.name}:

${starterKitText}

One small thing you can do today, right now: tell one person what you're good at. Text or tell a friend, "hey, I think I could actually get paid for ${first.name.toLowerCase()}." Most people never say this out loud — and it's often what makes it feel real.

Talk soon,
The Sellable Team`;

    // ---- STEP 3: Send the email using Resend ----
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'Sellable <onboarding@resend.dev>',
        to: [email],
        subject: 'Your Sellable results are in 🎉',
        text: emailBody
      })
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `Email sending failed: ${resendError}` })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
