import { useAccount,  useConnect, useDisconnect } from 'wagmi'

import { useWalletClient } from 'wagmi'
import { useEffect, useState } from 'react';
import { 
  privateKeyToAccount, generatePrivateKey
} from "viem/accounts";
import { SmartSessionMode } from "@rhinestone/module-sdk/module"
// import { ModuleType } from "@biconomy/account";

// const privateKey = generatePrivateKey();
// const account2 = privateKeyToAccount(`${privateKey}`);
import {
  createBicoPaymasterClient, createNexusClient, toSmartSessionsValidator, smartSessionCreateActions,
  smartSessionUseActions, CreateSessionDataParams, SessionData,
  createNexusSessionClient
} from "@biconomy/sdk";

import { baseSepolia } from "viem/chains"; 
import { Hex, encodeFunctionData, parseEther, http } from "viem";

const chainId = 84532
const bundlerUrl = `https://bundler.biconomy.io/api/v3/${chainId}/${import.meta.env.VITE_BUNDLER_PAYMASTER_KEY}`;
const paymasterUrl = `https://paymaster.biconomy.io/api/v2/${chainId}/${import.meta.env.VITE_PAYMASTER_BICONOMY_KEY}`; 
console.log({bundlerUrl, paymasterUrl})
const CONTRACT_ADDRESS = "0x225af9d6e43bf232ffc51a7b6e53ee7b0a0ccbeb"
function App() {
  const account = useAccount()
  const {data: walletClient} = useWalletClient();
  console.log({account})
  const { connectors, connect, status, error } = useConnect()
  const { disconnect } = useDisconnect()
  const [txHashes, setTxHashes] = useState([]);
  const [nexusClient, setNexusClient] = useState();
  const [nexusSessionClient, setNexusSessionClient] = useState();
  const [createSessionsResponse, setCreateSessionsResponse] = useState();
  const [sessionData, setSessionData] =  useState();
  const [sessionOwner, setSessionOwner] =  useState();

  const setClient = async (account:any) => {
    const c = await createNexusClient({
      signer: account,
      chain: baseSepolia,
      transport: http(),
      bundlerTransport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({paymasterUrl})
    })
    // console.log('***1', c.account, account)
    // console.log('***2', account)
    // const sessionsModule2 = toSmartSessionsValidator({ 
    //   account: c.account,
    //   signer: account
    // });
    // console.log({sessionsModule2})
    setNexusClient(c)
    // isModuleInstalled seems not working
    // const _sessionsModule = toSmartSessionsValidator({ 
    //   account: c && c.account,
    //   signer: account.account
    // });
    // console.log('**233', _sessionsModule.module)
    // const isInstalled = await c.isModuleInstalled({
    //   type: 4 , // 4: Validator
    //   moduleAddress: _sessionsModule.module
    // });
    // console.log('**234', isInstalled)
    var so = localStorage.getItem(`sessionOwner`)
    if(!so){
      so = generatePrivateKey()
      localStorage.setItem(`sessionOwner`, so)
    }
    setSessionOwner(privateKeyToAccount(so))
    const compressedSessionData = localStorage.getItem(`compressedSessionData:${c.account.address}`) as SessionData
    setSessionData(JSON.parse(compressedSessionData))
  };
  
  useEffect(() => {
    setClient(walletClient)
  }, [walletClient]); // Empty dependency array means it runs only once when the component mounts
  console.log({nexusClient, nexusSessionClient,createSessionsResponse, sessionData})
  console.log(nexusClient && nexusClient.account && nexusClient.account.address)
  // Step 4 https://docs.biconomy.io/tutorials/smart-sessions#install-the-smart-sessions-module
  const installSessionModule = async (nexusClient:any, account:any) => {
    console.log('***installSessionModule1')
    const sessionsModule = toSmartSessionsValidator({ 
      account: nexusClient.account,
      signer: account
    });
    console.log('***installSessionModule2', sessionsModule)
    const hash = await nexusClient.installModule({ 
      module: sessionsModule.moduleInitData
    })
    console.log('***installSessionModule3', hash)
    const { success: installSuccess, receipt } = await nexusClient.waitForUserOperationReceipt({ hash });
    console.log('***installSessionModule4', installSuccess, receipt)
    setTxHashes(txHashes.concat(receipt.transactionHash))
    const nsc = nexusClient.extend(smartSessionCreateActions(sessionsModule));
    console.log('***installSessionModule5', nexusSessionClient)
    setNexusSessionClient(nsc)
  }

  // Step 5 https://docs.biconomy.io/tutorials/smart-sessions#create-a-smart-session
  const createSmartSession = async (nexusClient:any, nexusSessionClient:any, sessionOwner:any) => {
    console.log('***createSmartSession1', nexusSessionClient)
    const sessionPublicKey = sessionOwner.address;
    console.log('***createSmartSession2', sessionPublicKey)
    const sessionRequestedInfo: CreateSessionDataParams[] = [
        {
            sessionPublicKey,
            actionPoliciesInfo: [
            {
                contractAddress: CONTRACT_ADDRESS, // Replace with your contract address
                rules: [],
                functionSelector: "0x3c7a3aff" as Hex // Function selector for 'incrementNumber'
            },
            {
              contractAddress: CONTRACT_ADDRESS, // Replace with your contract address
              rules: [],
              functionSelector: "0xa475b5dd" as Hex // Function selector for 'incrementNumber'
            },
          ]
        }
    ];
    console.log('***createSmartSession3', sessionRequestedInfo)
    const _createSessionsResponse = await nexusSessionClient.grantPermission({
        sessionRequestedInfo
    });
    console.log('***createSmartSession4', _createSessionsResponse)
    const { success, receipt } = await nexusClient.waitForUserOperationReceipt({ 
        hash: _createSessionsResponse.userOpHash
    });
    console.log('***createSmartSession5', success, receipt)
    setTxHashes(txHashes.concat(receipt.transactionHash))
    setCreateSessionsResponse(_createSessionsResponse)
    // Step 6: https://docs.biconomy.io/tutorials/smart-sessions#create-active-session-data
    const sessionData: SessionData = {
      granter: nexusClient.account.address,
      sessionPublicKey,
      moduleData: {
          permissionIds: _createSessionsResponse.permissionIds,
          mode: SmartSessionMode.USE
      }
    };   
    const compressedSessionData = JSON.stringify(sessionData);
    console.log('***createSmartSession6', {compressedSessionData})
    localStorage.setItem(`compressedSessionData:${nexusClient.account.address}`, compressedSessionData)
    console.log('***createSmartSession7')
    setSessionData(sessionData)
    console.log('***createSmartSession8')
  }

  const executeSmartSession = async (sessionData:any, functionName:String, sessionOwner: any) => {
    const smartSessionNexusClient = await createNexusSessionClient({
      chain: baseSepolia,
      accountAddress: sessionData.granter,
      signer: sessionOwner,
      transport: http(),
      bundlerTransport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({paymasterUrl})
    });
    console.log('*** smartSessionNexusClient1', executeSmartSession)

    const usePermissionsModule = toSmartSessionsValidator({
      account: smartSessionNexusClient.account,
      signer: sessionOwner,
      moduleData: sessionData.moduleData
    });
    console.log('*** smartSessionNexusClient2', usePermissionsModule)
    const useSmartSessionNexusClient = smartSessionNexusClient.extend(
      smartSessionUseActions(usePermissionsModule)
    );
    console.log('*** smartSessionNexusClient3', useSmartSessionNexusClient)  
    const userOpHash = await useSmartSessionNexusClient.usePermission({
        calls: [
            {
                to: CONTRACT_ADDRESS, // Replace with your target contract address
                data: encodeFunctionData({
                    abi: [
                     {
                        "inputs":[],
                        "name":"commit",
                        "outputs":[],
                        "stateMutability":"nonpayable",
                        "type":"function"
                     },
                     {
                      "inputs":[],
                      "name":"reveal",
                      "outputs":[],
                      "stateMutability":"nonpayable",
                      "type":"function"
                     },
                    ],
                    functionName: functionName
                })
            }
        ]
    });
    console.log(`Transaction hash: ${userOpHash}`);
    const receipt = await useSmartSessionNexusClient.waitForUserOperationReceipt({ hash: userOpHash });
    console.log(`receipt: ${userOpHash}`, {receipt});
    setTxHashes(txHashes.concat(receipt.receipt.transactionHash))
  }

  const handleGaslessTransaction = async () => {
    const hash = await nexusClient.sendTransaction({ calls:  
    [
      {
      to : '0xf5715961C550FC497832063a98eA34673ad7C816', value: parseEther('0')}] },
    ); 
    console.log("Transaction hash: ", hash) 
    const receipt = await nexusClient.waitForTransactionReceipt({ hash });  
    setTxHashes(txHashes.concat(receipt.transactionHash))
    console.log("Transaction receipt: ", { receipt})
  };
  
  return (
    <>
      <div>
        <h2>Account</h2>

        <div>
          status: {account.status}
          <br />
          owner addresses: {JSON.stringify(account.addresses)}
          <br />
          chainId: {account.chainId}
          <br />
          sca addresses: {nexusClient && nexusClient.account && (nexusClient.account.address)}
          <br />
          session owner: {sessionOwner && sessionOwner.address}
        </div>

        {account.status === 'connected' && (
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
        )}
      </div>

      <div>
        <h2>Connect</h2>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            type="button"
          >
            {connector.name}
          </button>
        ))}
        <div>{status}</div>
        <div>{error?.message}</div>
      </div>
      <div>
        <h2>Gasless Transaction</h2>
        <button
          onClick={handleGaslessTransaction}
        >
          Send Gasless transaction
        </button>
        <br/>
        <h2>Smart Session</h2>
        <button type="button" onClick={() => {
          installSessionModule(nexusClient, account)
        }}>
          Install Session Module
        </button>
        <button type="button" onClick={() => {
          createSmartSession(nexusClient, nexusSessionClient, sessionOwner)
        }}>
          Create Smart Session
        </button>
        <br/>
        <button type="button" onClick={() => {
          executeSmartSession(sessionData, 'commit', sessionOwner)
        }}>
          Commit
        </button>
        <button type="button" onClick={() => {
          executeSmartSession(sessionData, 'reveal', sessionOwner)
        }}>
          Reveal
        </button>
      </div>
      <div>
      <h5>Txs</h5>
          <ul>
            {
              txHashes.map(tx => {
                console.log('**txhashes', tx)
                return (<li>https://sepolia.basescan.org/tx/{tx}</li>)
              })
            }
          </ul>
      </div>
    </>
  )
}

export default App
