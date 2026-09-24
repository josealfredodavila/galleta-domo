// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ================================================================
// UPGRADE PROXY (UUPS)
// ================================================================
// Proxy UUPS para contratos actualizables.
//
// Este contrato NO contiene lógica de negocio. Solo delega
// todas las llamadas al contrato de implementación actual.
//
// Uso:
//   1. Deployar la implementación (CsarielsToken o CsarielsNFT).
//   2. Deployar este proxy apuntando a esa implementación.
//   3. Los usuarios interactúan con el proxy.
//   4. Para actualizar: deployar nueva implementación y llamar
//      a `upgradeToAndCall` desde el contrato actual.
//
// Este es el `ERC1967Proxy` de OpenZeppelin, que ya implementa
// el estándar de storage slots para evitar colisiones.
// ================================================================

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title UpgradeProxy
 * @notice Proxy UUPS para contratos actualizables
 * @dev Heredado de ERC1967Proxy de OpenZeppelin
 */
contract UpgradeProxy is ERC1967Proxy {
    /**
     * @notice Constructor del proxy
     * @param _logic Dirección de la implementación inicial
     * @param _data Datos de inicialización (opcional)
     */
    constructor(address _logic, bytes memory _data)
        ERC1967Proxy(_logic, _data)
    {}

    /**
     * @notice Devuelve la dirección de la implementación actual
     */
    function implementation() external view returns (address) {
        return _implementation();
    }
}