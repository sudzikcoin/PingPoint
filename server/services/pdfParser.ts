import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

export interface ParsedRateConfirmation {
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  pickupDate?: string;
  deliveryDate?: string;
  rate?: string;
  commodity?: string;
  weight?: string;
  notes?: string;
  shipperName?: string;
  shipperPhone?: string;
  receiverName?: string;
  receiverPhone?: string;
  carrierName?: string;
  driverPhone?: string;
  equipmentType?: string;
  customerRef?: string;
  loadNumber?: string;
}

export interface ParseResult {
  success: boolean;
  data?: ParsedRateConfirmation;
  error?: string;
}

export async function parsePdfRateConfirmation(pdfFilePath: string): Promise<ParseResult> {
  if (!CLAUDE_API_KEY) {
    fs.unlink(pdfFilePath, () => {});
    return {
      success: false,
      error: "Claude API key not configured. Set ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable.",
    };
  }

  try {
    const pdfBuffer = fs.readFileSync(pdfFilePath);
    const base64Pdf = pdfBuffer.toString("base64");

    const anthropic = new Anthropic({
      apiKey: CLAUDE_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text: `Extract freight/logistics information from this rate confirmation PDF. Return ONLY valid JSON (no markdown, no explanation, no code blocks):

{
  "pickupAddress": "street address of pickup location",
  "pickupCity": "city",
  "pickupState": "2-letter state code",
  "pickupZip": "zip code",
  "pickupDate": "YYYY-MM-DD format if available",
  "deliveryAddress": "street address of delivery location",
  "deliveryCity": "city",
  "deliveryState": "2-letter state code",
  "deliveryZip": "zip code",
  "deliveryDate": "YYYY-MM-DD format if available",
  "rate": "numeric rate amount only, no currency symbol",
  "commodity": "description of goods",
  "weight": "weight with unit",
  "notes": "any special instructions",
  "shipperName": "shipper/pickup company name",
  "shipperPhone": "shipper phone if available",
  "receiverName": "receiver/consignee company name",
  "receiverPhone": "receiver phone if available",
  "carrierName": "carrier/trucking company name",
  "driverPhone": "driver phone if available",
  "equipmentType": "VAN, REEFER, FLATBED, etc.",
  "customerRef": "reference number, PO, or BOL",
  "loadNumber": "load number if shown"
}

Only include fields that you can extract from the document. Use null for missing fields.`,
            },
          ],
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return {
        success: false,
        error: "No text response from Claude",
      };
    }

    let jsonText = textContent.text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    const parsed: ParsedRateConfirmation = JSON.parse(jsonText);

    fs.unlink(pdfFilePath, (err) => {
      if (err) console.log(`[PDF Parser] Could not delete temp file: ${err.message}`);
    });

    return {
      success: true,
      data: parsed,
    };
  } catch (error: any) {
    console.error("[PDF Parser] Error parsing PDF:", error);

    fs.unlink(pdfFilePath, () => {});

    if (error.message?.includes("JSON")) {
      return {
        success: false,
        error: "Failed to parse PDF content. The document format may not be recognized.",
      };
    }

    return {
      success: false,
      error: error.message || "Unknown error parsing PDF",
    };
  }
}
