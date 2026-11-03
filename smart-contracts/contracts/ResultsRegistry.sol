// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Registre d'empreintes des résultats du simulateur de consensus UNIKIN
/// @notice Horodate une déclaration ; ne vérifie pas l'exécution du consensus hors chaîne.
/// @dev Aucun ETH accepté, aucun transfert, aucune clé privilégiée et aucun appel externe.
contract ResultsRegistry {
    bytes32 public constant REGISTRY_ID = keccak256("UNIKIN_CONSENSUS_RESULTS_V2");
    struct Result {
        address publisher;
        uint8 protocol; // 0 = PoW, 1 = PoS, 2 = PBFT.
        uint16 nodes;
        uint32 blocks; // Genesis compris, dans la branche du nœud de référence.
        bytes32 traceHash; // Empreinte de la trace publique complète canonisée.
        uint32 transactions; // Paiements inclus dans cette branche.
        uint32 secured; // Confirmés (PoW) ou finalisés (PoS), selon le modèle déclaré.
        uint64 durationMs;
    }
    mapping(bytes32 => Result) private results;
    // Horodatage séparé : il ne participe jamais aux décisions d’intégrité ou d’accès.
    mapping(bytes32 => uint64) public recordedAt;
    uint256 public totalRecords;
    error InvalidResult();
    error AlreadyRecorded(bytes32 resultId);
    error ResultNotFound(bytes32 resultId);
    event ResultRecorded(bytes32 indexed resultId, address indexed publisher, bytes32 indexed traceHash,
        uint8 protocol, uint16 nodes, uint32 blocks, uint32 transactions, uint32 secured, uint64 durationMs);

    /// @notice L'identité du résultat lie l'auteur et la trace ; un tiers ne peut pas réserver sa clé.
    function resultId(address publisher, bytes32 traceHash) public pure returns (bytes32) {
        return keccak256(abi.encode(publisher, traceHash));
    }

    /// @notice L'appelant enregistre sa propre déclaration, une seule fois par empreinte.
    function recordRun(bytes32 traceHash, uint8 protocol, uint16 nodes, uint32 blocks,
        uint32 transactions, uint32 secured, uint64 durationMs) external returns (bytes32 id) {
        if (traceHash == bytes32(0) || protocol > 2 || nodes == 0 || nodes > 64 || blocks == 0 || blocks > 1000
            || transactions > 1000 || secured > transactions || durationMs == 0 || durationMs > 30 days * 1000) {
            revert InvalidResult();
        }
        id = resultId(msg.sender, traceHash);
        if (results[id].publisher != address(0)) revert AlreadyRecorded(id);
        // L'auteur provient uniquement de msg.sender : aucun champ d'auteur usurpable.
        results[id] = Result(msg.sender, protocol, nodes, blocks, traceHash, transactions, secured, durationMs);
        recordedAt[id] = uint64(block.timestamp);
        ++totalRecords;
        emit ResultRecorded(id, msg.sender, traceHash, protocol, nodes, blocks, transactions, secured, durationMs);
    }

    function getResult(bytes32 id) external view returns (Result memory value) {
        value = results[id];
        if (value.publisher == address(0)) revert ResultNotFound(id);
    }

    function verify(bytes32 id, bytes32 traceHash) external view returns (bool) {
        return results[id].publisher != address(0) && results[id].traceHash == traceHash;
    }
}
