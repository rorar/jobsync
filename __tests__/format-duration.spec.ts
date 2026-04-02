import { formatDuration } from "@/lib/format-duration";

describe("formatDuration", () => {
  // Mock translation function that returns i18n key suffix
  const mockT = (key: string): string => {
    const map: Record<string, string> = {
      "common.hourShort": "h",
      "common.minuteShort": "m",
      "common.secondShort": "s",
    };
    return map[key] ?? key;
  };

  describe("seconds only (< 60)", () => {
    it("should format 0 seconds", () => {
      expect(formatDuration(0, mockT)).toBe("0s");
    });

    it("should format 1 second", () => {
      expect(formatDuration(1, mockT)).toBe("1s");
    });

    it("should format 59 seconds", () => {
      expect(formatDuration(59, mockT)).toBe("59s");
    });
  });

  describe("minutes and seconds (60-3599)", () => {
    it("should format exactly 60 seconds", () => {
      expect(formatDuration(60, mockT)).toBe("1m 0s");
    });

    it("should format 90 seconds", () => {
      expect(formatDuration(90, mockT)).toBe("1m 30s");
    });

    it("should format 3599 seconds", () => {
      expect(formatDuration(3599, mockT)).toBe("59m 59s");
    });
  });

  describe("hours, minutes, and seconds (>= 3600)", () => {
    it("should format exactly 1 hour", () => {
      expect(formatDuration(3600, mockT)).toBe("1h 0m 0s");
    });

    it("should format 3725 seconds", () => {
      expect(formatDuration(3725, mockT)).toBe("1h 2m 5s");
    });

    it("should format multiple hours", () => {
      expect(formatDuration(7261, mockT)).toBe("2h 1m 1s");
    });
  });

  describe("guard against invalid input", () => {
    it("should handle negative numbers", () => {
      expect(formatDuration(-100, mockT)).toBe("0s");
    });

    it("should handle NaN", () => {
      expect(formatDuration(NaN, mockT)).toBe("0s");
    });

    it("should handle Infinity", () => {
      expect(formatDuration(Infinity, mockT)).toBe("0s");
    });

    it("should handle negative Infinity", () => {
      expect(formatDuration(-Infinity, mockT)).toBe("0s");
    });
  });

  describe("fractional seconds", () => {
    it("should floor fractional seconds", () => {
      expect(formatDuration(1.9, mockT)).toBe("1s");
    });

    it("should floor fractional minutes", () => {
      expect(formatDuration(61.5, mockT)).toBe("1m 1s");
    });
  });
});
