import express from "express";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Credentials cleaning helper to handle surrounding quotes or whitespaces often pasted into Vercel
function cleanEnvVar(val: string | undefined): string {
  if (!val) return "";
  let s = val.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.substring(1, s.length - 1);
  } else if (s.startsWith("'") && s.endsWith("'")) {
    s = s.substring(1, s.length - 1);
  }
  return s.trim();
}

function logEnvVarStatus(name: string, value: string | undefined) {
  if (value === undefined) {
    console.log(`[Elite Log] Env Var [${name}] is UNDEFINED`);
  } else if (value.trim() === "") {
    console.log(`[Elite Log] Env Var [${name}] is DEFINED but EMPTY/BLANK`);
  } else {
    const trimmed = value.trim();
    const clean = cleanEnvVar(value);
    const hasQuotes = trimmed !== clean;
    console.log(`[Elite Log] Env Var [${name}] is loaded. Info: Length=${value.length}, CleanedLength=${clean.length}, HasSurroundingQuotes=${hasQuotes}, SafeMask=${clean.substring(0, 4)}...${clean.substring(Math.max(0, clean.length - 4))}`);
  }
}

const RAW_RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAW_RAZORPAY_SECRET = process.env.RAZORPAY_SECRET;
const RAW_SUPABASE_URL = process.env.SUPABASE_URL;
const RAW_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RAW_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

console.log("[Elite Log] Raw Environment Variable Statuses:");
logEnvVarStatus("RAZORPAY_KEY_ID", RAW_RAZORPAY_KEY_ID);
logEnvVarStatus("RAZORPAY_SECRET", RAW_RAZORPAY_SECRET);
logEnvVarStatus("SUPABASE_URL", RAW_SUPABASE_URL);
logEnvVarStatus("SUPABASE_ANON_KEY", RAW_SUPABASE_ANON_KEY);
logEnvVarStatus("ADMIN_PASSWORD", RAW_ADMIN_PASSWORD);

const RAZORPAY_KEY_ID = cleanEnvVar(RAW_RAZORPAY_KEY_ID) || "rzp_test_T1oVRFtyfopJZm";
const RAZORPAY_SECRET = cleanEnvVar(RAW_RAZORPAY_SECRET) || "NFWLt1VWGXGhQvExDJi4Ta5G";
const SUPABASE_URL = cleanEnvVar(RAW_SUPABASE_URL) || "https://irgxpixneqholwwunili.supabase.co";
const SUPABASE_ANON_KEY = cleanEnvVar(RAW_SUPABASE_ANON_KEY) || "sb_publishable_GsBC4Y_vIckkp9Ko8gYNjw_ESUuE_3U";
const ADMIN_PASSWORD = cleanEnvVar(RAW_ADMIN_PASSWORD) || "admin123";

console.log("[Elite Log] Initializing Connections in consolidated index.ts...");
console.log("[Elite Log] Sanitized Supabase URL:", SUPABASE_URL);
console.log("[Elite Log] Sanitized Razorpay Key ID:", RAZORPAY_KEY_ID);

// Initialize Supabase Client within a resilient try/catch block
let supabase: any = null;
let supabaseInitError: string | null = null;

try {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is missing or blank.");
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY is missing or blank.");
  }
  new URL(SUPABASE_URL); // validates format
  
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[Elite Log] Supabase client initialized successfully with sanitized credentials.");
} catch (err: any) {
  supabaseInitError = err?.message || String(err);
  console.error("[Elite Log] Critical failure during Supabase client initialization:", err);
}

// In-Memory cache fallback ledger so that developer testing is uninterrupted if Supabase table is not generated yet.
interface InMemOrder {
  custom_order_id: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  customer_name: string;
  phone: string;
  address: string;
  amount: number;
  payment_status: "pending" | "paid" | "failed";
  created_at: string;
}
const inMemoryOrders: InMemOrder[] = [];

// ESM and CommonJS resilient constructor loader for Razorpay
let rzp: any;
try {
  const RazorpayConstructor = (Razorpay as any).default || Razorpay;
  rzp = new RazorpayConstructor({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_SECRET,
  });
  console.log("[Elite Log] Razorpay client initialized successfully.");
} catch (err) {
  console.error("[Elite Log] Critical Error initializing Razorpay constructor:", err);
}

// API CONFIG
app.get("/api/config", (req, res) => {
  console.log("[Elite Log] GET /api/config requested.");
  res.json({ razorpayKeyId: RAZORPAY_KEY_ID });
});

// GET ORDERS (Reads live transactions from Supabase database table with in-memory resilient fallback)
app.get("/api/orders", async (req, res) => {
  console.log("[Elite Log] GET /api/orders requested. Validating authorization headers...");
  
  const authHeader = req.headers.authorization;
  const expectedHeader = `Bearer ${ADMIN_PASSWORD}`;
  
  if (!authHeader || authHeader !== expectedHeader) {
    console.warn("[Elite Log] Unauthorized try to read orders table.");
    return res.status(401).json({ error: "Unauthorized access: Admin password authorization is required." });
  }

  console.log("[Elite Log] Authorization valid. Querying Supabase...");
  let fetchedData: any[] = [];
  let supabaseConnected = true;
  let supabaseError = null;

  try {
    if (!supabase) {
      throw new Error(`Supabase client is not initialized. Setup diagnostic error: ${supabaseInitError || "unknown"}`);
    }
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("custom_order_id", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[Elite Log] Supabase select query returned error:", error);
      supabaseConnected = false;
      supabaseError = error.message;
    } else {
      fetchedData = data || [];
    }
  } catch (err: any) {
    console.error("[Elite Log] Exception during GET /api/orders:", err);
    supabaseConnected = false;
    supabaseError = err.message || "Connection exception";
  }

  // If Supabase query failed, return the high-performance in-memory fallback list
  const dataList = supabaseConnected ? fetchedData : [...inMemoryOrders].sort((a, b) => b.custom_order_id.localeCompare(a.custom_order_id));
  
  res.json({
    orders: dataList,
    supabaseConnected,
    supabaseError
  });
});

// CREATE ORDER
app.post("/api/create-order", async (req, res) => {
  console.log("[Elite Log] POST /api/create-order received. Payload:", req.body);
  try {
    const { customerName, phone, address, quantity } = req.body;

    if (!customerName || !phone || !address || !quantity || quantity < 1) {
      console.warn("[Elite Log] Attempted order creation with missing attributes.");
      return res.status(400).json({ error: "Please fill out all forms details before ordering." });
    }

    // 1. Calculate and generate incremental custom_order_id (with resilient fallback)
    let customOrderId = "VELIQUE-1001";
    let useFallbackID = false;
    try {
      if (!supabase) {
        throw new Error("Supabase client is not initialized.");
      }
      const { data: lastOrders, error: fetchError } = await supabase
        .from("orders")
        .select("custom_order_id")
        .order("custom_order_id", { ascending: false })
        .limit(1);

      if (fetchError || !lastOrders) {
        console.error("[Elite Log] Failed to fetch last custom_order_id from Supabase:", fetchError);
        useFallbackID = true;
      } else if (lastOrders && lastOrders.length > 0) {
        const lastId = lastOrders[0].custom_order_id;
        const match = lastId.match(/VELIQUE-(\d+)/);
        if (match) {
          const lastNum = parseInt(match[1], 10);
          customOrderId = `VELIQUE-${lastNum + 1}`;
        }
      }
    } catch (err) {
      console.error("[Elite Log] ID generator calculation exception. Falling back to in-memory check.", err);
      useFallbackID = true;
    }

    if (useFallbackID) {
      if (inMemoryOrders.length > 0) {
        const sortedInMem = [...inMemoryOrders].sort((a, b) => b.custom_order_id.localeCompare(a.custom_order_id));
        const lastId = sortedInMem[0].custom_order_id;
        const match = lastId.match(/VELIQUE-(\d+)/);
        if (match) {
          const lastNum = parseInt(match[1], 10);
          customOrderId = `VELIQUE-${lastNum + 1}`;
        }
      } else {
        customOrderId = "VELIQUE-1001";
      }
    }

    const amountRupees = 100 * quantity;
    const amountPaisa = amountRupees * 100;
    console.log(`[Elite Log] Generating Order ${customOrderId} for ₹${amountRupees} (${amountPaisa} paisa)`);

    // 2. Create order on Razorpay Gateway
    const options = {
      amount: amountPaisa,
      currency: "INR",
      receipt: customOrderId,
    };

    if (!rzp) {
      throw new Error("Razorpay client is not initialized. Check credentials.");
    }
    const razorpayOrder = await rzp.orders.create(options);
    console.log("[Elite Log] Razorpay order successfully created. Gateway Reference ID:", razorpayOrder.id);

    // Save also to memory as cache/fallback
    const newOrderData = {
      custom_order_id: customOrderId,
      razorpay_order_id: razorpayOrder.id,
      customer_name: customerName,
      phone: phone,
      address: address,
      amount: amountRupees,
      payment_status: "pending" as const,
      created_at: new Date().toISOString()
    };
    inMemoryOrders.push(newOrderData);

    // 3. Write row into Supabase 'orders' Table with 'pending' status
    console.log(`[Elite Log] Inserting pending order row into Supabase database...`);
    try {
      if (!supabase) {
        throw new Error("Supabase client is not initialized.");
      }
      const { error: insertError } = await supabase
        .from("orders")
        .insert({
          custom_order_id: customOrderId,
          razorpay_order_id: razorpayOrder.id,
          customer_name: customerName,
          phone: phone,
          address: address,
          amount: amountRupees,
          payment_status: "pending",
        });

      if (insertError) {
        console.error("[Elite Log] Supabase insertion returned database error, utilizing backend in-memory cache:", insertError);
      } else {
        console.log(`[Elite Log] Row successfully written in Supabase 'orders' with status: pending.`);
      }
    } catch (err: any) {
      console.error("[Elite Log] Supabase insertion exception, utilizing backend in-memory cache:", err);
    }

    // 4. Return variables to client
    res.json({
      orderId: razorpayOrder.id,
      customOrderId: customOrderId,
      amount: amountPaisa,
      currency: "INR",
    });

  } catch (err: any) {
    console.error("[Elite Log] Catch all exception on order creation route:", err);
    res.status(500).json({ error: err.message || "Failed to process order creation payload." });
  }
});

// VERIFY PAYMENT (Calculates and checks signature, then updates status row to paid)
app.post("/api/verify-payment", async (req, res) => {
  console.log("[Elite Log] POST /api/verify-payment received. Signature arguments:", req.body);
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.warn("[Elite Log] Missing signature arguments inside verify payload.");
      return res.status(400).json({ error: "Incomplete payment signatures passed." });
    }

    // Verify razorpay signature locally
    const hmac = crypto.createHmac("sha256", RAZORPAY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const localSignature = hmac.digest("hex");

    console.log("[Elite Log] Local signature:", localSignature);
    console.log("[Elite Log] Razorpay signature:", razorpay_signature);

    if (localSignature !== razorpay_signature) {
      console.error("[Elite Log] SECURITY EXCEPTION: Local signature mismatch!");
      
      // Update local state fallback memory
      const inMemIndex = inMemoryOrders.findIndex(o => o.razorpay_order_id === razorpay_order_id);
      if (inMemIndex > -1) {
        inMemoryOrders[inMemIndex].payment_status = "failed";
      }

      // Mark transaction failed on failure
      try {
        if (!supabase) {
          throw new Error("Supabase client is not initialized.");
        }
        const { error: failStatusError } = await supabase
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("razorpay_order_id", razorpay_order_id);

        if (failStatusError) {
          console.error("[Elite Log] Error writing failed payment status into database:", failStatusError);
        }
      } catch (err) {
        console.error("[Elite Log] Error during fail state writing on Supabase:", err);
      }

      return res.status(400).json({ error: "Razorpay secure payment verification signature failed." });
    }

    // Signature match successful! Update Database payment_status to 'paid'
    console.log(`[Elite Log] Secure check succeeded! Updating row ${razorpay_order_id} to PAID...`);
    
    // Always update local cache state first
    const inMemIndex = inMemoryOrders.findIndex(o => o.razorpay_order_id === razorpay_order_id);
    if (inMemIndex > -1) {
      inMemoryOrders[inMemIndex].razorpay_payment_id = razorpay_payment_id;
      inMemoryOrders[inMemIndex].payment_status = "paid";
    }

    try {
      if (!supabase) {
        throw new Error("Supabase client is not initialized.");
      }
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          razorpay_payment_id: razorpay_payment_id,
          payment_status: "paid",
        })
        .eq("razorpay_order_id", razorpay_order_id);

      if (updateError) {
        console.error("[Elite Log] Database state amendment failure, utilizing backend cache fallback:", updateError);
      } else {
        console.log(`[Elite Log] Success! Order ${razorpay_order_id} is marked as paid in Supabase 'orders' table.`);
      }
    } catch (err: any) {
      console.error("[Elite Log] Supabase state amendment exception, utilizing backend cache fallback:", err);
    }

    res.json({
      status: "success",
      message: "Order transaction securely registered and marked as paid.",
    });

  } catch (err: any) {
    console.error("[Elite Log] Signature verification system exception:", err);
    res.status(500).json({ error: err.message || "Failed payment signature checks." });
  }
});

// MARK PAYMENT FAILED
app.post("/api/payment-failed", async (req, res) => {
  console.log("[Elite Log] POST /api/payment-failed received. Mark order as failed:", req.body);
  try {
    const { razorpay_order_id } = req.body;
    if (!razorpay_order_id) {
      return res.status(400).json({ error: "Missing razorpay_order_id" });
    }

    console.warn(`[Elite Log] Updating order row ${razorpay_order_id} state to failed.`);
    
    // Update local cache state
    const inMemIndex = inMemoryOrders.findIndex(o => o.razorpay_order_id === razorpay_order_id);
    if (inMemIndex > -1) {
      inMemoryOrders[inMemIndex].payment_status = "failed";
    }

    try {
      if (!supabase) {
        throw new Error("Supabase client is not initialized.");
      }
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("razorpay_order_id", razorpay_order_id);

      if (error) {
        console.error("[Elite Log] Database update error during marking as failed on Supabase:", error);
      } else {
        console.log(`[Elite Log] Successfully logged failed transaction state in Supabase for ${razorpay_order_id}`);
      }
    } catch (err) {
      console.error("[Elite Log] Exception marking order failed on Supabase:", err);
    }

    res.json({ status: "success", message: "Successfully saved failed order state." });
  } catch (err: any) {
    console.error("[Elite Log] Exception marking order failed:", err);
    res.status(500).json({ error: err.message });
  }
});

export default app;
