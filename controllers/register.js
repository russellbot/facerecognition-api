const jwt = require('jsonwebtoken');
const redis = require("redis");
//SET UP REDIS
const redisClient = redis.createClient(process.env.REDIS_URI);

const handleRegister = (req, res, db, bcrypt) => {
    const { email, name, password } = req.body
    if (!email || !name || !password) {
        return res.status(400).json('incorrect form submission')
    }
    const hash = bcrypt.hashSync(password)
    db.transaction((trx) => {
        trx
            .insert({
                hash: hash,
                email: email,
            }) 
        .into('login')
        .returning('email')
        .then((loginEmail) => {
            return trx('users')
            .returning('*')
            .insert({
                email: loginEmail[0],
                name: name,
                joined: new Date(),
            })
            .then(user => {
                res.json(user[0]);
            })
        })     
        .then(trx.commit)   
        .catch(trx.rollback)
    })    
    .catch((err) => res.status(400).json('unable to register')) 
    // .catch((err) => res.status(400).json(err))  
}

const getAuthTokenId = (req, res) => {
	const { authorization } = req.headers;
	return redisClient.get(authorization, (err, reply) => {
		if(err || !reply) {
			return res.status(400).json('Unauthorised')
		}
		return res.json({id: reply})
	})
}

const registerToken = (email) => {
	const jwtPayload = { email };
	return jwt.sign(jwtPayload, 'JWT_secret', { expiresIn: '7 days'})
}

const setToken = (key, value) => {
	return Promise.resolve(redisClient.set(key, value))
}

const createSession = (user) => {
	//create jwt token and return user info 
	const { email, id } = user;
	const token = registerToken(email)
	return setToken(token, id)
		.then(()=> {
			return { success: 'true', userId: id, token: token }
		})
		.catch(err=> res.status(400).json('Invalid Email or Password'))
}

const registerAuthentication = (db, bcrypt) => (req, res) => { //higher order as it returns another function
	const { authorization } = req.headers;
	return authorization &&
		handleRegister(req, res, db, bcrypt) 
		.then(user => {
			console.log(user.id, user.email)
			return user.id && user.email ?
			createSession(user) : Promise.reject(user)
		})
		.then(session => res.json(session))
		.catch(err=> res.status(400).json('Invalid Email or Password')) 
	
} 

module.exports = {
    handleRegister: handleRegister,
    registerAuthentication: registerAuthentication
}