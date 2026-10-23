import { describe, expect, it } from "vitest";
import { containsPersonalData, scrubPersonalData, truncateIp } from "../src/privacy";

describe("personal data scrubbing", () => {
  it("removes emails, MyKad, phone numbers and IPs", () => {
    expect(scrubPersonalData("email me at ali.bin@example.com")).toBe("email me at [email]");
    expect(scrubPersonalData("IC 900101-14-5678 please")).toBe("IC [id] please");
    expect(scrubPersonalData("IC 900101145678")).toBe("IC [id]");
    expect(scrubPersonalData("call 012-345 6789")).toBe("call [phone]");
    expect(scrubPersonalData("call +60 12-345 6789")).toBe("call [phone]");
    expect(scrubPersonalData("my public ip is 203.0.113.45")).toBe("my public ip is [ip]");
    expect(scrubPersonalData("login at 192.168.1.1")).toBe("login at 192.168.1.1");
  });
  it("keeps model numbers and ordinary text", () => {
    expect(scrubPersonalData("RT-AX86U firmware 3.0.0.4")).toBe("RT-AX86U firmware 3.0.0.4");
    expect(scrubPersonalData("ASUS 3.0.0.4.388_24198")).toBe("ASUS 3.0.0.4.388_24198");
    expect(containsPersonalData("wifi slow on archer c6")).toBe(false);
  });
  it("truncates IPs", () => {
    expect(truncateIp("203.0.113.45")).toBe("203.0.113.0");
    expect(truncateIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::");
  });
});
