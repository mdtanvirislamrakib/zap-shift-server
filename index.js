const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

dotenv.config();
const stripe = require("stripe")(process.env.SECRET_STRIPE);
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;

// add firebase service counter
const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_USER_PASS}@cluster0.nvanxw5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const parcelCollection = client.db("parcel_DB").collection("parcels");
    const paymentHistoryCollection = client
      .db("parcel_DB")
      .collection("payments");

    const trackingCollection = client
      .db("parcel_DB")
      .collection("tracking_updates");
    const usersCollection = client.db("parcel_DB").collection("users");
    const ridersCollection = client.db("parcel_DB").collection("riders");

    // custom middleware verify firebase Token
    const verifyFirebaseToken = async (req, res, next) => {
      const authHeader = req?.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized access!!" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "Unauthorized access!!" });
      }

      // verify the token
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        console.log(decoded);
        next();
      } catch (error) {
        res.status(403).send({ message: "Forbidden access!!" });
      }
    };


    const verifyAdmin = async(req, res, next) => {
      const {email} = req.decoded;
      console.log(email);
      const user = await usersCollection.findOne({email})
      console.log(user);
      if(!user || user.role !== "admin") {
        return res.status(403).send({message: "Forbidden access"})
      }
      next();
    }

    // Search & Role Toggle Routes
    app.get("/users/search", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email)
          return res.status(400).send({ message: "Email query is required" });

        const regex = new RegExp(email, "i"); // case-insensitive search
        const users = await usersCollection
          .find({ email: { $regex: regex } })
          .toArray();

        res.send(users);
      } catch (err) {
        console.error("Search error", err);
        res.status(500).send({ message: "Failed to search users" });
      }
    });

    // users data are store here
    app.post("/users", async (req, res) => {
      const email = req?.body?.email;
      const userExists = await usersCollection.findOne({ email });

      if (userExists) {
        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" }); // default role is "user" if undefined
      } catch (error) {
        console.error("Error fetching user role:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // POST: Create a new parcel
    app.post("/parcels", verifyFirebaseToken, async (req, res) => {
      try {
        const newParcel = req.body;

        // Add createdAt timestampd
        // newParcel.createdAt = new Date();

        const result = await parcelCollection.insertOne(newParcel);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error Inserting Parcel", error);
        res.status(500).send({ message: "Failed to create parcel" });
      }
    });

    // get parcel by user emial
    app.get("/parcels", async (req, res) => {
      try {
        const userEmail = req.query.email;

        const query = userEmail ? { created_by: userEmail } : {};

        const options = {
          sort: { createdAt: -1 },
        };
        const parcels = await parcelCollection.find(query, options).toArray();
        res.send(parcels);
      } catch (error) {
        console.error("Error fatching parcels", error);
        res.status(500).send({ message: "Failed to get parcel" });
      }
    });

    app.patch("/users/:id/role", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;

        if (!["admin", "user"].includes(role)) {
          return res.status(400).send({ message: "Invalid role" });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        res.send(result);
      } catch (err) {
        console.error("Role update error", err);
        res.status(500).send({ message: "Failed to update user role" });
      }
    });

    // GET: Get a specific parcel by ID
    app.get("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // Check if the ID is a valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid parcel ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const parcel = await parcelCollection.findOne(query);

        if (!parcel) {
          return res.status(404).send({ message: "Parcel not found" });
        }

        res.send(parcel);
      } catch (error) {
        console.error("Error fetching parcel by ID", error);
        res
          .status(500)
          .send({ message: "Failed to fetch parcel", error: error.message });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const amoutCents = req?.body?.amoutCents;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amoutCents, // Amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/payments", verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.query.email;


        if (req.decoded.email !== userEmail) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const query = userEmail ? { email: userEmail } : {};
        const options = { sort: { paid_at: -1 } };

        const payments = await paymentHistoryCollection
          .find(query, options)
          .toArray();
        res.send(payments);
      } catch (error) {
        console.log("Error fatching payment history", error);
        res.status(500).send({ message: "Failed to get payments" });
      }
    });

    app.post("/riders", async (req, res) => {
      const rider = req.body;
      const result = await ridersCollection.insertOne(rider);
      res.send(result);
    });

    app.get("/riders/pending", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      try {
        const pendingRiders = await ridersCollection
          .find({ status: "pending" })
          .sort({ appliedAt: -1 }) // latest first
          .toArray();
        console.log(pendingRiders);
        res.send(pendingRiders);
      } catch (error) {
        console.error("Error fetching pending riders", error);
        res.status(500).send({ message: "Failed to load pending riders" });
      }
    });

    // patch update status data
    app.patch("/riders/:id/status", async (req, res) => {
      const { id } = req.params;
      const { status, email } = req.body;

      try {
        const result = await ridersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        // update user role for updating rider
        if (status === "active") {
          const userQuery = { email };
          const userUpdateDoc = {
            $set: {
              role: "rider",
            },
          };
          const roleResult = await usersCollection.updateOne(
            userQuery,
            userUpdateDoc
          );
        }

        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to update status", error: error.message });
      }
    });

    // find active rider data
    app.get("/riders/active",verifyFirebaseToken, verifyAdmin, async (req, res) => {
      try {
        const activeRiders = await ridersCollection
          .find({ status: "active" })
          .toArray();

        res.send(activeRiders);
      } catch (error) {
        console.error("Error fetching active riders:", error);
        res.status(500).send({ message: "Failed to load active riders" });
      }
    });

    app.post("/tracking", async (req, res) => {
      const {
        trackind_id,
        parcel_id,
        status,
        message,
        updated_by = "",
      } = req.body;

      const log = {
        trackind_id,
        parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
        status,
        message,
        time: new Date().toISOString(),
        updated_by,
      };
      const result = await trackingCollection.insertOne(log);
      res.send({ success: true, insertedId: result.insertedId });
    });

    app.post("/payments", async (req, res) => {
      try {
        const { parcelId, email, amount, paymentMethod, transactionId } =
          req.body;

        // update parcel's payment status
        const filter = { _id: new ObjectId(parcelId) };
        const updateResult = await parcelCollection.updateOne(filter, {
          $set: {
            payment_status: "paid",
          },
        });

        if (updateResult?.modifiedCount) {
          return res
            .status(404)
            .send({ message: "parcel not found or already paid" });
        }

        // 2 insert Payment record
        const paymentDoc = {
          parcelId,
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at: new Date().toISOString(),
        };

        const paymentResult = await paymentHistoryCollection.insertOne(
          paymentDoc
        );

        res.status(201).send({
          message: "Payment recoded and parcel marked is paid",
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Error fetching all payments", error);
        res.status(500).send({ message: "Failed to post payment history" });
      }
    });

    // DELETE: Delete a parcel by ID
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // Validate the ID format first
        if (!ObjectId?.isValid(id)) {
          return res.status(400).send({ message: "Invalid parcel ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const result = await parcelCollection.deleteOne(filter);

        if (result.deletedCount === 1) {
          return res.status(200).send({
            deletedCount: result.deletedCount,
            message: "Parcel deleted successfully",
          });
        } else {
          return res.status(404).send({ message: "Parcel not found" });
        }
      } catch (error) {
        console.error("Error deleting parcel", error);
        return res
          .status(500)
          .send({ message: "Failed to delete parcel", error: error.message });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Parcel server is running");
});

app.listen(port, () => {
  console.log("Server in running listening port", port);
});
