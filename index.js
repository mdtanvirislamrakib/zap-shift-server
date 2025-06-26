const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
const stripe = require("stripe")(
  "sk_test_51ReKbrIros3mgqZXqiQnUZNSP42zggTX2epwpoXfsd3CfOP4pw4b5a9zI27ZXsruDC5N5PyfUpnVWzi0IWkjHfvs006SqqyrlH"
);
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;

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

    // POST: Create a new parcel
    app.post("/parcels", async (req, res) => {
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


    app.get("/payments", async(req, res) => {
      try {
        const userEmail = req.query.email;

        const query = userEmail ? {email: userEmail} : {};
        const options = {sort: {paid_at: -1}}

        const payments = await paymentHistoryCollection.find(query, options).toArray()
        res.send(payments)




      } catch (error) {
        console.log("Error fatching payment history", error);
        res.status(500).send({message: 'Failed to get payments'})
      }
    })



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
