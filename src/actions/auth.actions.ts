"use server";
import { AuthError } from "next-auth";
import { signIn } from "../auth";
import { delay } from "@/utils/delay";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { SignupFormSchema } from "@/models/signupForm.schema";
import { JOB_SOURCES } from "@/lib/constants";
import { seedJobStatusesForUser } from "@/lib/crm/seed-job-statuses";
import { t, getUserLocale } from "@/i18n/server";
import { checkAuthRateLimit, getClientIp } from "@/lib/auth/auth-rate-limit";

export async function signup(formData: {
  name: string;
  email: string;
  password: string;
}) {
  // FL-3: Rate limit signup — 3 attempts per 60 minutes per IP
  const ip = await getClientIp();
  const limit = checkAuthRateLimit(ip, "signup");
  if (!limit.allowed) {
    const locale = await getUserLocale();
    const seconds = Math.ceil((limit.retryAfterMs ?? 0) / 1000);
    return { error: t(locale, "auth.rateLimitExceeded").replace("{seconds}", String(seconds)) };
  }

  const parsed = SignupFormSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: "Invalid form data." };
  }

  const { name, email, password } = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    // Generic message to prevent user enumeration (CWE-204)
    const locale = await getUserLocale();
    return { error: t(locale, "auth.unableToCreateAccount") };
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: { name, email, password: hashedPassword },
  });

  await prisma.jobSource.createMany({
    data: JOB_SOURCES.map((source) => ({
      label: source.label,
      value: source.value,
      createdBy: newUser.id,
    })),
  });

  // Custom JobStatus (Welle 4): seed the new user's per-user stage categories +
  // default statuses (replaces the old global jobStatus upsert, which post-
  // migration would violate NOT NULL userId and leave new users status-less).
  await seedJobStatusesForUser(prisma, newUser.id);

  return { success: true };
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  // FL-3: Rate limit signin — 5 attempts per 15 minutes per IP
  const ip = await getClientIp();
  const limit = checkAuthRateLimit(ip, "signin");
  if (!limit.allowed) {
    const seconds = Math.ceil((limit.retryAfterMs ?? 0) / 1000);
    return `Too many login attempts. Please try again in ${seconds} seconds.`;
  }

  try {
    await delay(1000);
    await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirect: false,
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}
