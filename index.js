const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
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

    // DELETE: Delete a parcel by ID
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
          return res
            .status(200)
            .send({
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
