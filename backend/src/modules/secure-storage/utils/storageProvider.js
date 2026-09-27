/**
 * storageProviderFor
 * @description Where an encrypted payload actually lives, derived from its stored CID. ipfsService writes to the local
 * encrypted fallback store (uploads/fallback-storage) under a `mock_ipfs_cid_<timestamp>` id whenever the IPFS node is
 * unreachable; every other CID came back from the IPFS (Kubo) node. Read-only labelling — it never changes storage.
 * @param {string|null|undefined} cid - FileVersion.ipfsCid
 * @returns {'local_fallback'|'ipfs'|null}
 */
const FALLBACK_CID_PREFIX = /^mock_ipfs_cid_/;

exports.storageProviderFor = (cid) => {
    if (!cid) return null;
    return FALLBACK_CID_PREFIX.test(String(cid)) ? 'local_fallback' : 'ipfs';
};
