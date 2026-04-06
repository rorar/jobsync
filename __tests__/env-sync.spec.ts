import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/utils/user.utils";
import { syncEnvVariable } from "@/lib/env-sync";

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

// Spy on the actual fs/promises methods
const readFileSpy = jest.spyOn(fs, "readFile");
const writeFileSpy = jest.spyOn(fs, "writeFile");

describe("syncEnvVariable", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "test-user-id" });
  });

  afterEach(() => {
    // Restore process.env to original state
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("writes a new key when .env exists without it", async () => {
    readFileSpy.mockResolvedValue("EXISTING_KEY=value1\nOTHER_KEY=value2" as any);
    writeFileSpy.mockResolvedValue(undefined as any);

    const result = await syncEnvVariable("NEXTAUTH_URL", "http://localhost:3737");

    expect(result).toEqual({ success: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), ".env"),
      "EXISTING_KEY=value1\nOTHER_KEY=value2\nNEXTAUTH_URL=http://localhost:3737"
    );
    expect(process.env.NEXTAUTH_URL).toBe("http://localhost:3737");
  });

  it("updates an existing key", async () => {
    readFileSpy.mockResolvedValue(
      "SOME_KEY=old_value\nALLOWED_DEV_ORIGINS=http://old:3000" as any
    );
    writeFileSpy.mockResolvedValue(undefined as any);

    const result = await syncEnvVariable(
      "ALLOWED_DEV_ORIGINS",
      "http://new:3737"
    );

    expect(result).toEqual({ success: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), ".env"),
      "SOME_KEY=old_value\nALLOWED_DEV_ORIGINS=new"
    );
    expect(process.env.ALLOWED_DEV_ORIGINS).toBe("new");
  });

  it("removes a key when value is undefined", async () => {
    readFileSpy.mockResolvedValue(
      "KEEP_ME=yes\nALLOWED_DEV_ORIGINS=http://old:3000\nALSO_KEEP=true" as any
    );
    writeFileSpy.mockResolvedValue(undefined as any);

    const result = await syncEnvVariable("ALLOWED_DEV_ORIGINS", undefined);

    expect(result).toEqual({ success: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), ".env"),
      "KEEP_ME=yes\nALSO_KEEP=true"
    );
    expect(process.env.ALLOWED_DEV_ORIGINS).toBeUndefined();
  });

  it("removes a key when value is empty string", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3737";
    readFileSpy.mockResolvedValue("NEXTAUTH_URL=http://localhost:3737\nOTHER=val" as any);
    writeFileSpy.mockResolvedValue(undefined as any);

    const result = await syncEnvVariable("NEXTAUTH_URL", "");

    expect(result).toEqual({ success: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), ".env"),
      "OTHER=val"
    );
    expect(process.env.NEXTAUTH_URL).toBeUndefined();
  });

  it("creates .env when it does not exist", async () => {
    readFileSpy.mockRejectedValue(new Error("ENOENT: no such file"));
    writeFileSpy.mockResolvedValue(undefined as any);

    const result = await syncEnvVariable("NEXTAUTH_URL", "http://localhost:3737");

    expect(result).toEqual({ success: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), ".env"),
      "\nNEXTAUTH_URL=http://localhost:3737"
    );
    expect(process.env.NEXTAUTH_URL).toBe("http://localhost:3737");
  });

  it("handles write errors gracefully", async () => {
    readFileSpy.mockResolvedValue("NEXTAUTH_URL=http://old:3000" as any);
    writeFileSpy.mockRejectedValue(new Error("Permission denied"));

    const result = await syncEnvVariable("NEXTAUTH_URL", "http://localhost:3737");

    expect(result).toEqual({ success: false });
  });

  it("does not modify other keys when updating one", async () => {
    readFileSpy.mockResolvedValue("FIRST=1\nNEXTAUTH_URL=http://old:3000\nTHIRD=3" as any);
    writeFileSpy.mockResolvedValue(undefined as any);

    await syncEnvVariable("NEXTAUTH_URL", "http://localhost:3737");

    const writtenContent = writeFileSpy.mock.calls[0][1] as string;
    expect(writtenContent).toContain("FIRST=1");
    expect(writtenContent).toContain("NEXTAUTH_URL=http://localhost:3737");
    expect(writtenContent).toContain("THIRD=3");
  });

  it("handles removing a key that does not exist in .env", async () => {
    readFileSpy.mockResolvedValue("EXISTING=value" as any);
    writeFileSpy.mockResolvedValue(undefined as any);

    const result = await syncEnvVariable("ALLOWED_DEV_ORIGINS", undefined);

    expect(result).toEqual({ success: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), ".env"),
      "EXISTING=value"
    );
  });

  it("handles values with special characters", async () => {
    readFileSpy.mockResolvedValue("" as any);
    writeFileSpy.mockResolvedValue(undefined as any);

    const result = await syncEnvVariable(
      "ALLOWED_DEV_ORIGINS",
      "http://192.168.1.100:3737, http://myhost.ts.net:3737"
    );

    expect(result).toEqual({ success: true });
    expect(writeFileSpy).toHaveBeenCalledWith(
      path.join(process.cwd(), ".env"),
      "\nALLOWED_DEV_ORIGINS=192.168.1.100, myhost.ts.net"
    );
  });
});
