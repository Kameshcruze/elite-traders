import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import crypto from "crypto";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Credentials
  const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_T1oVRFtyfopJZm";
  const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET || "NFWLt1VWGXGhQvExDJi4Ta5G";
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://irgxpixneqholwwunili.supabase.co";
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_GsBC4Y_vIckkp9Ko8gYNjw_ESUuE_3U";

  // Initialize Supabase Client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Initialize Razorpay Client
  const rzp = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_SECRET,
  });

  // API Endpoints
  app.get("/api/config", (req, res) => {
    res.json({ razorpayKeyId: RAZORPAY_KEY_ID });
  });

  // Get orders list
  app.get("/api/orders", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("custom_order_id", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error getting orders from Supabase:", error);
        return res.status(500).json({ error: error.message });
      }

      res.json(data || []);
    } catch (error: any) {
      console.error("Error in GET /api/orders:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create order
  app.post("/api/create-order", async (req, res) => {
    try {
      const { customerName, phone, address, quantity } = req.body;

      if (!customerName || !phone || !address || !quantity || quantity < 1) {
        return res.status(400).json({ error: "Missing customer or product details. Please fill out the form." });
      }

      // 1. Generate Order ID
      let customOrderId = "VELIQUE-1001";
      try {
        const { data: lastOrders, error: fetchError } = await supabase
          .from("orders")
          .select("custom_order_id")
          .order("custom_order_id", { ascending: false })
          .limit(1);

        if (fetchError) {
          console.error("Error reading last order ID from Supabase:", fetchError);
        }

        if (lastOrders && lastOrders.length > 0) {
          const lastId = lastOrders[0].custom_order_id;
          const match = lastId.match(/VELIQUE-(\d+)/);
          if (match) {
            const lastNum = parseInt(match[1], 10);
            customOrderId = `VELIQUE-${lastNum + 1}`;
          }
        }
      } catch (err) {
        console.error("Error calculation in custom_order_id:", err);
        customOrderId = `VELIQUE-${1000 + Math.floor(Math.random() * 9000)}`;
      }

      const amountRupees = 100 * quantity;
      const amountPaisa = amountRupees * 100;

      // 2. Create Order on Razorpay
      const options = {
        amount: amountPaisa,
        currency: "INR",
        receipt: customOrderId,
      };

      const razorpayOrder = await rzp.orders.create(options);
      console.log("Successfully created Razorpay Order:", razorpayOrder.id);

      // 3. Insert Row in Supabase orders Table
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
        console.error("Supabase insert error for order row:", insertError);
        // Throw or return if DB insertion is strictly required (which it is for our flow test)
        return res.status(500).json({ error: `Failed to record order row in Supabase: ${insertError.message}` });
      }

      console.log(`Inserted order row in Supabase with Status: pending, Order ID: ${customOrderId}`);

      // 4. Return order information
      res.json({
        orderId: razorpayOrder.id,
        customOrderId: customOrderId,
        amount: amountPaisa,
        currency: "INR",
      });

    } catch (error: any) {
      console.error("Error creating Razorpay order / database mapping:", error);
      res.status(500).json({ error: error.message || "Failed to create payment order" });
    }
  });

  // Verify payment
  app.post("/api/verify-payment", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "A payment verification request requires order ID, payment ID, and signature" });
      }

      // Signature generation
      const hmac = crypto.createHmac("sha256", RAZORPAY_SECRET);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const generatedSignature = hmac.digest("hex");

      console.log(`Verifying payment for Order: ${razorpay_order_id}`);
      console.log(`Generated: ${generatedSignature}`);
      console.log(`Received: ${razorpay_signature}`);

      if (generatedSignature !== razorpay_signature) {
        console.error("Signature verification mismatch!");
        // Update payment status to failed on mismatch
        await supabase
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("razorpay_order_id", razorpay_order_id);

        return res.status(400).json({ error: "Security check failed: Razorpay signature verification mismatch" });
      }

      // Success! Update status in database
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          razorpay_payment_id: razorpay_payment_id,
          payment_status: "paid",
        })
        .eq("razorpay_order_id", razorpay_order_id);

      if (updateError) {
        console.error("Db update error for completed payment:", updateError);
        return res.status(500).json({ error: "Payment was success but saving transaction to DB failed" });
      }

      console.log(`Payment confirmed and recorded as paid in DB for order ${razorpay_order_id}`);
      res.json({
        status: "success",
        message: "Payment successfully verified and registered into database",
      });
    } catch (error: any) {
      console.error("Signature verification system exception:", error);
      res.status(500).json({ error: error.message || "Could not verify payment" });
    }
  });

  // Mark payment failed
  app.post("/api/payment-failed", async (req, res) => {
    try {
      const { razorpay_order_id } = req.body;
      if (!razorpay_order_id) {
        return res.status(400).json({ error: "Missing razorpay_order_id" });
      }

      console.warn(`Upgrading status to failed for order: ${razorpay_order_id}`);
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("razorpay_order_id", razorpay_order_id);

      if (error) {
        console.error("Error setting order row to failed:", error);
      }

      res.json({ status: "success", message: "Recorded payment failure state" });
    } catch (error: any) {
      console.error("Error handling failure API:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Handle building static output paths & Vite mounting
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started. Running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("CRITICAL ERROR: Failed to boot express application:", err);
  process.exit(1);
});
