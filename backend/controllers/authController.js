const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const EscrowStore = require('../models/EscrowStore');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ethers } = require('ethers');

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
        const { name, email, password, role, specialty, escrowPackage } = req.body;

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
            // Process Escrow Package if provided
            if (escrowPackage && escrowPackage.envelopes && escrowPackage.commitments) {
                try {
                    // Separate on-chain envelope (Custodian 2) and off-chain envelopes
                    const onChainEnvelope = escrowPackage.envelopes.find(e => e.custodianId === 2);
                    const offChainEnvelopes = escrowPackage.envelopes.filter(e => e.custodianId !== 2);

                    // 1. Store off-chain envelopes
                    await EscrowStore.create({
                        patientPubKey: escrowPackage.patientPubKey,
                        envelopes: offChainEnvelopes
                    });

                    // 2. Dispatch on-chain envelope to Ganache
                    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:7545';
                    const provider = new ethers.JsonRpcProvider(rpcUrl);
                    const adminWallet = new ethers.Wallet(
                        process.env.REGISTRY_ADMIN_KEY || process.env.PRIVATE_KEY, 
                        provider
                    );
                    
                    const registryAddress = process.env.KEY_ESCROW_REGISTRY_ADDRESS;
                    if (registryAddress) {
                        const abi = [
                            "function depositEscrow(bytes32 patientPubKey, bytes calldata encryptedShare, tuple(uint256 x, uint256 y) c0, tuple(uint256 x, uint256 y) c1, tuple(uint256 x, uint256 y) c2, address trustee) external"
                        ];
                        const registry = new ethers.Contract(registryAddress, abi, adminWallet);
                        
                        // Convert public key base64 to bytes32 (hash it)
                        // In reality, patientPubKey is 32 bytes (X25519 public key)
                        const pubKeyBuffer = Buffer.from(escrowPackage.patientPubKey, 'base64');
                        const patientPubKeyHex = '0x' + pubKeyBuffer.toString('hex');
                        
                        const ciphertextHex = '0x' + Buffer.from(JSON.stringify(onChainEnvelope)).toString('hex');
                        
                        const c0 = { x: escrowPackage.commitments[0].x, y: escrowPackage.commitments[0].y };
                        const c1 = { x: escrowPackage.commitments[1].x, y: escrowPackage.commitments[1].y };
                        const c2 = { x: escrowPackage.commitments[2].x, y: escrowPackage.commitments[2].y };
                        
                        const trustee = adminWallet.address; // For prototype
                        
                        const tx = await registry.depositEscrow(patientPubKeyHex, ciphertextHex, c0, c1, c2, trustee);
                        await tx.wait();
                    }
                } catch (escrowErr) {
                    console.error("Escrow deposit failed:", escrowErr);
                    // We don't fail registration if escrow fails for prototype
                }
            }

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
