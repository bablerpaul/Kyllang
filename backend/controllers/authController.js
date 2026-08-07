const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * generateAccessToken
 */
const generateAccessToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret_key', {
        expiresIn: '15m', // Short-lived Access Token
    });
};

/**
 * generateRefreshToken
 */
const generateRefreshToken = async (userId) => {
    const token = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Days
    await RefreshToken.create({ user: userId, token, expiresAt });
    return token;
};

/**
 * setTokensInCookies
 */
const setTokensInCookies = (res, accessToken, refreshToken) => {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000 // 15 mins
    });
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
};

/**
 * register
 * @description Handles operations for register. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.register = async (req, res, next) => {
    try {
        const { name, email, password, role, specialty } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please add all fields' , error: 'Please add all fields'  });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists' , error: 'User already exists'  });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password,
            role: role || 'general_user',
            specialty: role === 'doctor' ? specialty : undefined,
        });

        if (user) {
            const accessToken = generateAccessToken(user._id);
            const refreshToken = await generateRefreshToken(user._id);
            setTokensInCookies(res, accessToken, refreshToken);

            res.status(201).json({ success: true, message: 'Operation successful', data: {
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: accessToken, // Maintain backward compatibility for frontend
            } });
        } else {
            res.status(400).json({ success: false, message: 'Invalid user data' , error: 'Invalid user data'  });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * login
 * @description Handles operations for login. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Check for user email
        const user = await User.findOne({ email }).select('+password');

        if (user && (await user.matchPassword(password))) {
            const accessToken = generateAccessToken(user._id);
            const refreshToken = await generateRefreshToken(user._id);
            setTokensInCookies(res, accessToken, refreshToken);

            res.json({ success: true, message: 'Operation successful', data: {
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: accessToken,
            } });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' , error: 'Invalid credentials'  });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * getMe
 * @description Handles operations for getMe. Explains parameters, return values and usage.
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Function} next - The Express next middleware function
 * @returns {Promise<void>} Resolves when the operation is complete
 */
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        res.status(200).json({ success: true, message: 'Operation successful', data: user });
    } catch (error) {
        next(error);
    }
};

/**
 * refreshAccessToken
 * @description Generates a new access token using a valid refresh token.
 */
exports.refreshAccessToken = async (req, res, next) => {
    try {
        const refreshTokenCookie = req.cookies.refreshToken;
        if (!refreshTokenCookie) {
            return res.status(401).json({ success: false, message: 'No refresh token provided' });
        }

        const tokenRecord = await RefreshToken.findOne({ token: refreshTokenCookie, revoked: false });
        if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
            return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
        }

        const user = await User.findById(tokenRecord.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const newAccessToken = generateAccessToken(user._id);
        const newRefreshToken = await generateRefreshToken(user._id);
        
        // Revoke the old refresh token
        tokenRecord.revoked = true;
        await tokenRecord.save();

        setTokensInCookies(res, newAccessToken, newRefreshToken);

        res.status(200).json({ success: true, message: 'Token refreshed', data: { token: newAccessToken } });
    } catch (error) {
        next(error);
    }
};

/**
 * logout
 * @description Revokes refresh token and clears cookies.
 */
exports.logout = async (req, res, next) => {
    try {
        const refreshTokenCookie = req.cookies.refreshToken;
        if (refreshTokenCookie) {
            await RefreshToken.findOneAndUpdate({ token: refreshTokenCookie }, { revoked: true });
        }

        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};
