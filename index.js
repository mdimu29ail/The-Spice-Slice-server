const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const cors = require('cors');
const dotenv = require('dotenv');

const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// middle ware
// `https://my-assignment-11-server-lac.vercel.app/foods?email=${user.email}`
app.use(
  cors({
    origin: ['https://spice-slice.vercel.app'],
    credentials: true,
  }),
);
app.use(express.json());

app.use(cookieParser());

const logger = (req, res, next) => {
  console.log('inside the logger');
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  console.log('cookie in middleware', token);

  if (!token) {
    return res
      .status(401)
      .send({ message: 'Authorization failed: No token provided' });
  }
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ message: 'Authorization failed: Invalid token' });
    }
    req.decoded = decoded;
    next();
  });
};

dotenv.config();
if (!process.env.MONGODB_USER || !process.env.MONGODB_PASS) {
  console.error('MONGODB_USER and MONGODB_PASS must be set in .env file');
  process.exit(1);
}

app.get('/', (req, res) => {
  res.send('Hello World!!!!!!!!!');
});

const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@cluster0.lvqirhw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const foodsCollection = client.db('foodsDB').collection('foods');
    const applicationCollection = client
      .db('foodsDB')
      .collection('applications');
    // Send a ping to confirm a successful connection

    app.post('/jwt', async (req, res) => {
      const userData = req.body;

      const token = jwt.sign(userData, process.env.JWT_ACCESS_SECRET, {
        expiresIn: '1d',
      });
      res.cookie('token', token, {
        httpOnly: true,
        secure: false,
      });

      res.send({ success: true });
    });

    app.get('/foods', async (req, res) => {
      const cursor = foodsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/foods/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodsCollection.findOne(query);
      res.send(result);

      console.log(objectId(id));
    });

    // app.get('/applications', async (req, res) => {
    //   const email = req.query.email;
    //   const query = {
    //     applicant: email,
    //   };

    //   const result = await applicationCollection.find(query).toArray();

    //   for (const application of result) {
    //     const foodsId = application.foodId;
    //     const foodQuery = { _id: new ObjectId(foodsId) };
    //     const food = await foodsCollection.findOne(foodQuery);

    //     application.name = food.name;
    //     application.category = food.category;
    //     application.image_url = food.image_url;
    //     application.price_usd = food.price_usd;
    //     application.rating = food.rating;
    //     application.cuisine = food.cuisine;
    //     application.description = food.description;
    //     application.purchase_count = food.purchase_count;
    //   }

    //   res.send(result);
    // });

    app.get('/applications', logger, verifyToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden Access' });
      }
      if (!email) {
        return res
          .status(400)
          .send({ message: 'Email query parameter is required.' });
      }

      const query = {
        applicant: email,
      };

      try {
        const applications = await applicationCollection.find(query).toArray();

        const populatedApplications = await Promise.all(
          applications.map(async application => {
            const foodId = application.foodId;

            if (!foodId) {
              console.warn(
                `Application with _id ${application._id} is missing foodId.`,
              );
              return { ...application, foodDetailsMissing: true };
            }

            let food = null;
            try {
              const foodObjectId = new ObjectId(foodId);
              const foodQuery = { _id: foodObjectId };
              food = await foodsCollection.findOne(foodQuery);
            } catch (error) {
              console.error(
                `Error creating ObjectId for foodId '${foodId}' in application _id ${application._id}:`,
                error,
              );
              return { ...application, invalidFoodIdFormat: true };
            }

            if (food) {
              application.name = food.name;
              application.category = food.category;
              application.image_url = food.image_url;
              application.price_usd = food.price_usd;
              application.rating = food.rating;
              application.cuisine = food.cuisine;
              application.description = food.description;
              application.purchase_count = food.purchase_count;
              application.foodDetails = { _id: food._id };
            } else {
              console.warn(
                `Food with ID ${foodId} not found for application _id ${application._id}.`,
              );

              application.foodNotFound = true;
            }

            return application;
          }),
        );

        res.send(populatedApplications);
      } catch (error) {
        console.error('Error fetching applications or food data:', error);
        res
          .status(500)
          .send({ message: 'An error occurred while fetching applications.' });
      }
    });

    app.get('/foods', async (req, res) => {
      const email = req.query.email;
      if (!email)
        return res.status(400).send({ error: 'Email query is required' });

      const result = await foodsCollection.find({ createdBy: email }).toArray();
      res.send(result);
    });

    app.post('/foods', async (req, res) => {
      const newJobs = req.body;

      const result = await foodsCollection.insertOne(newJobs);

      res.send(result);
    });

    app.post('/applications', async (req, res) => {
      const application = req.body;
      const result = await applicationCollection.insertOne(application);
      res.send(result);
    });

    app.delete('/applications/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await applicationCollection.deleteOne(query);

      res.send(result);
    });

    // Example Express route to delete food by ID permanently

    app.delete('/foods/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodsCollection.deleteOne(query);

      console.log(result);
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: 'Food not found' });
      }
      res.send(result);
    });

    app.patch('/foods/:id', async (req, res) => {
      const id = req.params.id;
      const updatedFood = req.body;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: updatedFood.name,
          category: updatedFood.category,
          image_url: updatedFood.image_url,
          price_usd: updatedFood.price_usd,
          rating: updatedFood.rating,
          cuisine: updatedFood.cuisine,
          description: updatedFood.description,
          quantity: updatedFood.quantity,
        },
      };

      const result = await foodsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!',
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
