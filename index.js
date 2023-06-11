const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;


// Middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req , res , next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({ error: true, message: "Unauthorized access"});
  }

  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err , decoded) => {
    if(err){
      return res.status(401).send({ error: true, message: "Unauthorized access"});
    }

    req.decoded = decoded;
    next();

  })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rqhkoll.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("musicMentor").collection("users");
    const allClassesCollection = client.db("musicMentor").collection("allClasses");
    const selectedClassesCollection = client.db("musicMentor").collection("selectedClasses");
    const paymentCollection = client.db("musicMentor").collection("payments");

    app.post('/jwt' , (req , res) => {
      const user = req.body;
      const token = jwt.sign(user , process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'})
      res.send({ token })
    })


    // Users related apis start-------------------
    app.get('/users', verifyJWT,  async (req , res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.post('/users' , async(req , res) => {
      const user = req.body;
      const query = {email: user.email}
      const existingUser = await usersCollection.findOne(query);
      if(existingUser){
        return res.send({message: "User is already exist"})
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users/admin/:email',verifyJWT, async(req, res) => {
      const email = req.params.email;

      if(req.decoded.email !== email){
        res.send({admin: false})
      }

      const query = {email: email}
      const user = await usersCollection.findOne(query);
      const result = {admin: user?.role === 'admin'};
      res.send(result);
    })

    app.get('/users/instructor/:email',verifyJWT, async(req, res) => {
      const email = req.params.email;

      if(req.decoded.email !== email){
        res.send({instructor: false})
      }

      const query = {email: email}
      const user = await usersCollection.findOne(query);
      const result = {instructor: user?.role === 'instructor'};
      res.send(result);
    })

    app.get('/users/student/:email',verifyJWT, async(req, res) => {
      const email = req.params.email;

      if(req.decoded.email !== email){
        res.send({student: false})
      }

      const query = {email: email}
      const user = await usersCollection.findOne(query);
      const result = {student: user?.role === 'student'};
      res.send(result);
    })

    app.patch('/users/:id' , async(req , res) => {
      const id = req.params.id;
      const role = req.body.role;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role
        },
      };

      const result = await usersCollection.updateOne(filter , updateDoc);
      res.send(result);

    })
    // -----------------------------------------------
    //             Users related apis end
    // -----------------------------------------------

    // -----------------------------------------------
    //             Instructor related apis start
    // -----------------------------------------------

    app.get('/allinstructors',  async (req , res) => {
      const result = await usersCollection.find({role: "instructor"}).toArray();
      res.send(result);
    })

    app.get('/popularinstructors', async(req , res) => {
      const result = await usersCollection.aggregate([
        {
            "$match" : {
                "role" : "instructor"
            }
        }, 
        {
            "$lookup" : {
                "from" : "allClasses",
                "localField" : "email",
                "foreignField" : "instructor_email",
                "as" : "classes"
            }
        }, 
        {
            "$unwind" : {
                "path" : "$classes"
            }
        }, 
        {
            "$group" : {
                "_id" : "$_id",
                "instructor_name" : {
                    "$first" : "$name"
                },
                "image" : {
                    "$first" : "$image"
                },
                "email" : {
                    "$first" : "$email"
                },
                "class_names" : {
                    "$addToSet" : "$classes.class_name"
                },
                "total_enrolled_students" : {
                    "$sum" : "$classes.enrolled_student"
                }
            }
        }, 
        {
            "$sort" : {
                "total_enrolled_students" : -1
            }
        }, 
        {
            "$limit" : 6
        }
    ]).toArray();

    res.send(result)
    
    })

    app.get('/myclass/:email', async(req, res) => {
      const email = req.params.email;
      console.log(email)
      const result = await allClassesCollection.find({instructor_email: email}).toArray();
      console.log(result)
      res.send(result);
    })

    // -----------------------------------------------
    //             Instructor related apis end
    // -----------------------------------------------



    // -----------------------------------------------
    //           classes related apis start
    // -----------------------------------------------

    app.get('/allclass', async(req, res) => {
      const result = await allClassesCollection.find().toArray();
      res.send(result);
    })

    app.post('/addclass', async(req, res) => {
      const newClass = req.body;
      const result = await allClassesCollection.insertOne(newClass);
      res.send(result);
    })

    app.post('/selectedclasses', async(req, res) => {
      const item = req.body;
      const result = await selectedClassesCollection.insertOne(item);
      res.send(result);
    })

    app.get('/myselectedclass/:email' , async(req, res) => {
      const email = req.params.email;
      const result = await selectedClassesCollection.find({email: email}).toArray();
      res.send(result);
    })

    app.delete('/myselectedclass/:id' , async(req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id)};
      const result = await selectedClassesCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/popularclasses', async(req, res) => {
      const result = await allClassesCollection.find().sort({enrolled_student: -1}).limit(6).toArray();
      res.send(result);
    })

    app.patch('/allclass/:id' , async(req , res) => {
      const id = req.params.id;
      console.log(id)
      const status = req.body.status;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status
        },
      };

      const result = await allClassesCollection.updateOne(filter , updateDoc);
      res.send(result);

    })

    app.patch('/classfeedback/:id' , async(req , res) => {
      const id = req.params.id;
      console.log(id)
      const feedback = req.body.feedback;
      console.log(feedback)
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback
        },
      };

      const result = await allClassesCollection.updateOne(filter , updateDoc);
      res.send(result);

    })

    app.patch('/updateclass/:id' , async(req , res) => {
      const id = req.params.id;
      console.log(id)
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: data
      }


      const result = await allClassesCollection.updateOne(filter , updateDoc, {new: true});
      res.send(result);

    })


    // -----------------------------------------------
    //           classes related apis end
    // -----------------------------------------------

    // ---------------------------------------------
    //           CREATE PAYMENT INTENT
    // ---------------------------------------------

    app.post('/create-payment-intent',verifyJWT,  async(req, res) => {
      const {classItem} = req.body;
      const price = classItem.price;
      const amount = price*100;
      console.log(price , amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      
      res.send({
        clientSecret: paymentIntent.client_secret
      })

    })

    // ------------------------
    // PAYMENT RELATED API
    // -----------------------
    app.post('/payments',verifyJWT, async(req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);

      const query = { classItemId: payment.classItemId, email: payment.email};
      const deleteClass = await selectedClassesCollection.deleteOne(query);

      const classQuery = {_id: new ObjectId(payment.classItemId)}
      const updateClass = await allClassesCollection.findOneAndUpdate(classQuery, {$inc: {available_seats: -1, enrolled_student: 1}},{new: true})


      res.send({result, deleteClass, updateClass});
    })

    app.get('/payments/:email', async(req, res) => {
      const email = req.params.email;
      const result = await paymentCollection.find({email: email}).sort({_id: -1}).toArray();
      res.send(result);
    })

    // ---------------------


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req , res) => {
    res.send('Music Master is running')
})

app.listen(port , () => {
    console.log(`Music master is running on port: ${port}`)
})