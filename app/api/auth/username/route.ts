import { env } from "cloudflare:workers";
import {
  isSameOrigin,
  requireAuthUser,
  validateUsername,
} from "@/app/server/auth";

export const dynamic = "force-dynamic";

function isUsernameConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /users(?:\.|_)username|users_username_unique/i.test(message);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;

  let input: { username?: unknown };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const validation = validateUsername(input.username);
  if (!validation.ok) {
    return Response.json(
      {
        error: validation.error,
        code:
          validation.reason === "reserved"
            ? "USERNAME_RESERVED"
            : "USERNAME_INVALID",
      },
      { status: validation.reason === "reserved" ? 409 : 400 },
    );
  }

  if (auth.user.username) {
    return Response.json(
      {
        error: "Your username is already set.",
        code: "USERNAME_ALREADY_SET",
      },
      { status: 409 },
    );
  }

  try {
    const result = await env.DB.prepare(
      "UPDATE users SET username = ? WHERE id = ? AND username IS NULL",
    )
      .bind(validation.username, auth.user.id)
      .run();

    if ((result.meta.changes ?? 0) !== 1) {
      return Response.json(
        {
          error: "Your username is already set.",
          code: "USERNAME_ALREADY_SET",
        },
        { status: 409 },
      );
    }
  } catch (error) {
    if (isUsernameConflict(error)) {
      return Response.json(
        {
          error: "That username is taken.",
          code: "USERNAME_TAKEN",
        },
        { status: 409 },
      );
    }
    throw error;
  }

  return Response.json(
    {
      user: {
        id: auth.user.id,
        phoneLabel: auth.user.phoneLabel,
        username: validation.username,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
