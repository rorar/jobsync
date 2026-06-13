// Mock auth rate limiter — must be before auth.actions import
jest.mock("@/lib/auth/auth-rate-limit", () => ({
  checkAuthRateLimit: jest.fn().mockReturnValue({ allowed: true }),
  getClientIp: jest.fn().mockResolvedValue("127.0.0.1"),
  resetAuthRateLimitStore: jest.fn(),
}));

import { signup, authenticate } from "@/actions/auth.actions";
import { signIn } from "@/auth";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { JOB_SOURCES } from "@/lib/constants";
import { seedJobStatusesForUser } from "@/lib/crm/seed-job-statuses";
import { delay } from "@/utils/delay";

// Mock dependencies
jest.mock("@/lib/db", () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  jobSource: {
    createMany: jest.fn(),
  },
  jobStatus: {
    upsert: jest.fn(),
  },
}));

// Welle 4: signup seeds per-user statuses via this helper (tested separately).
jest.mock("@/lib/crm/seed-job-statuses", () => ({
  seedJobStatusesForUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/auth", () => ({
  signIn: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
}));

jest.mock("@/utils/delay", () => ({
  delay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("next-auth", () => {
  class MockAuthError extends Error {
    type: string;

    constructor(message: string) {
      super(message);
      this.name = "AuthError";
      this.type = message;
    }
  }

  return {
    AuthError: MockAuthError,
  };
});

// Import the mocked AuthError to use in tests
const { AuthError } = require("next-auth");

describe("Auth Actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("signup", () => {
    const validSignupData = {
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
    };

    const mockNewUser = {
      id: "user-id",
      name: "John Doe",
      email: "john@example.com",
      password: "hashed_password_123",
    };

    it("should successfully create a new user", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);
      (prisma.jobStatus.upsert as jest.Mock).mockResolvedValue(undefined);

      const result = await signup(validSignupData);

      expect(result).toEqual({ success: true });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: validSignupData.email },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(validSignupData.password, 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: validSignupData.name,
          email: validSignupData.email,
          password: "hashed_password_123",
        },
      });
      expect(prisma.jobSource.createMany).toHaveBeenCalledWith({
        data: JOB_SOURCES.map((source) => ({
          label: source.label,
          value: source.value,
          createdBy: mockNewUser.id,
        })),
      });
    });

    it("should return error if user already exists", async () => {
      const existingUser = {
        id: "existing-user-id",
        email: validSignupData.email,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);

      const result = await signup(validSignupData);

      expect(result).toEqual({
        error: "Unable to create account. Please try a different email or sign in.",
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: validSignupData.email },
      });
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should return error when name is too short", async () => {
      const invalidData = {
        ...validSignupData,
        name: "A",
      };

      const result = await signup(invalidData);

      expect(result).toEqual({ error: "Invalid form data." });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should return error when email is invalid", async () => {
      const invalidData = {
        ...validSignupData,
        email: "invalid-email",
      };

      const result = await signup(invalidData);

      expect(result).toEqual({ error: "Invalid form data." });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should return error when email is too short", async () => {
      const invalidData = {
        ...validSignupData,
        email: "a@",
      };

      const result = await signup(invalidData);

      expect(result).toEqual({ error: "Invalid form data." });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should return error when password is too short", async () => {
      const invalidData = {
        ...validSignupData,
        password: "short",
      };

      const result = await signup(invalidData);

      expect(result).toEqual({ error: "Invalid form data." });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should create job sources for new user", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);
      (prisma.jobStatus.upsert as jest.Mock).mockResolvedValue(undefined);

      await signup(validSignupData);

      expect(prisma.jobSource.createMany).toHaveBeenCalledWith({
        data: JOB_SOURCES.map((source) => ({
          label: source.label,
          value: source.value,
          createdBy: mockNewUser.id,
        })),
      });
    });

    it("should create job sources with correct structure", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);
      (prisma.jobStatus.upsert as jest.Mock).mockResolvedValue(undefined);

      await signup(validSignupData);

      const jobSourcesCall = (prisma.jobSource.createMany as jest.Mock).mock
        .calls[0][0];
      expect(jobSourcesCall.data).toHaveLength(JOB_SOURCES.length);
      jobSourcesCall.data.forEach((source: any, index: number) => {
        expect(source).toEqual({
          label: JOB_SOURCES[index].label,
          value: JOB_SOURCES[index].value,
          createdBy: mockNewUser.id,
        });
      });
    });

    it("should include createdBy field in all job sources", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);
      (prisma.jobStatus.upsert as jest.Mock).mockResolvedValue(undefined);

      await signup(validSignupData);

      const jobSourcesCall = (prisma.jobSource.createMany as jest.Mock).mock
        .calls[0][0];
      jobSourcesCall.data.forEach((source: any) => {
        expect(source).toHaveProperty("createdBy");
        expect(source.createdBy).toBe(mockNewUser.id);
      });
    });

    it("should seed per-user statuses for the new user (Welle 4)", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);

      await signup(validSignupData);

      // Per-user seed (categories + default statuses) instead of the old global
      // jobStatus.upsert loop.
      expect(seedJobStatusesForUser).toHaveBeenCalledTimes(1);
      expect(seedJobStatusesForUser).toHaveBeenCalledWith(prisma, mockNewUser.id);
      expect(prisma.jobStatus.upsert).not.toHaveBeenCalled();
    });

    it("should create job sources before seeding statuses", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);

      await signup(validSignupData);

      const jobSourcesCallOrder = (prisma.jobSource.createMany as jest.Mock)
        .mock.invocationCallOrder[0];
      const seedCallOrder = (seedJobStatusesForUser as jest.Mock).mock
        .invocationCallOrder[0];

      expect(jobSourcesCallOrder).toBeLessThan(seedCallOrder);
    });

    it("should not create job sources if user creation fails", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      await expect(signup(validSignupData)).rejects.toThrow("Database error");

      expect(prisma.jobSource.createMany).not.toHaveBeenCalled();
      expect(seedJobStatusesForUser).not.toHaveBeenCalled();
    });

    it("should handle job source creation error", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockRejectedValue(
        new Error("Failed to create job sources"),
      );

      await expect(signup(validSignupData)).rejects.toThrow(
        "Failed to create job sources",
      );

      expect(prisma.jobStatus.upsert).not.toHaveBeenCalled();
    });

    it("should handle job status seeding error", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);
      (seedJobStatusesForUser as jest.Mock).mockRejectedValueOnce(
        new Error("Failed to seed job statuses"),
      );

      await expect(signup(validSignupData)).rejects.toThrow(
        "Failed to seed job statuses",
      );
    });

    it("should hash password with correct salt rounds", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_password_123");
      (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
      (prisma.jobSource.createMany as jest.Mock).mockResolvedValue(undefined);
      (prisma.jobStatus.upsert as jest.Mock).mockResolvedValue(undefined);

      await signup(validSignupData);

      expect(bcrypt.hash).toHaveBeenCalledWith(validSignupData.password, 10);
    });

    it("should return error if email is missing", async () => {
      const invalidData = {
        name: "John Doe",
        email: "",
        password: "password123",
      };

      const result = await signup(invalidData);

      expect(result).toEqual({ error: "Invalid form data." });
    });

    it("should return error if password is missing", async () => {
      const invalidData = {
        name: "John Doe",
        email: "john@example.com",
        password: "",
      };

      const result = await signup(invalidData);

      expect(result).toEqual({ error: "Invalid form data." });
    });
  });

  describe("authenticate", () => {
    const mockFormData = new FormData();
    mockFormData.set("email", "john@example.com");
    mockFormData.set("password", "password123");

    it("should return null on successful authentication", async () => {
      (signIn as jest.Mock).mockResolvedValue(undefined);

      const result = await authenticate("", mockFormData);

      expect(result).toBeNull();
      expect(delay).toHaveBeenCalledWith(1000);
      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "john@example.com",
        password: "password123",
        redirect: false,
      });
    });

    it("should return error message on invalid credentials", async () => {
      const authError = new AuthError("CredentialsSignin");
      (signIn as jest.Mock).mockRejectedValue(authError);

      const result = await authenticate("", mockFormData);

      expect(result).toEqual("Invalid credentials.");
      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "john@example.com",
        password: "password123",
        redirect: false,
      });
    });

    it("should return generic error message on unknown error", async () => {
      const authError = new AuthError("UnknownError");
      (signIn as jest.Mock).mockRejectedValue(authError);

      const result = await authenticate("", mockFormData);

      expect(result).toEqual("Something went wrong.");
    });

    it("should call delay before signing in", async () => {
      (signIn as jest.Mock).mockResolvedValue(undefined);

      await authenticate("", mockFormData);

      expect(delay).toHaveBeenCalledWith(1000);
      expect(signIn).toHaveBeenCalled();
      const delayCallOrder = (delay as jest.Mock).mock.invocationCallOrder[0];
      const signInCallOrder = (signIn as jest.Mock).mock.invocationCallOrder[0];
      expect(delayCallOrder).toBeLessThan(signInCallOrder);
    });

    it("should rethrow non-AuthError exceptions", async () => {
      const error = new Error("Database error");
      (signIn as jest.Mock).mockRejectedValue(error);

      try {
        await authenticate("", mockFormData);
        fail("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toBe("Database error");
      }
    });

    it("should extract form data correctly", async () => {
      (signIn as jest.Mock).mockResolvedValue(undefined);
      const testFormData = new FormData();
      testFormData.set("email", "test@example.com");
      testFormData.set("password", "testpass123");

      await authenticate("", testFormData);

      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "test@example.com",
        password: "testpass123",
        redirect: false,
      });
    });
  });
});
