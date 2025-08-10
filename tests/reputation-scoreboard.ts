import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ReputationScoreboard } from "../target/types/reputation_scoreboard";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";

describe("reputation-scoreboard", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ReputationScoreboard as Program<ReputationScoreboard>;
  
  // Test accounts
  const authority = anchor.web3.Keypair.generate();
  const voter = anchor.web3.Keypair.generate();
  const target = anchor.web3.Keypair.generate();
  const anotherTarget = anchor.web3.Keypair.generate();
  const unauthorizedUser = anchor.web3.Keypair.generate();
  
  // Test parameters
  const cooldownPeriod = new BN(5); // 5 seconds for testing
  const topContributorThreshold = new BN(3); // 3 upvotes to become top contributor
  
  // Token related variables
  let tokenMint: PublicKey;
  let voterTokenAccount: PublicKey;
  let unauthorizedTokenAccount: PublicKey;
  
  // PDA addresses
  let boardPDA: PublicKey;
  let boardBump: number;
  let targetEntryPDA: PublicKey;
  let targetEntryBump: number;
  let voteRecordPDA: PublicKey;
  let voteRecordBump: number;
  
  before(async () => {
    // Airdrop SOL to test accounts
    await provider.connection.requestAirdrop(authority.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(voter.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(unauthorizedUser.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      0
    );
    
    // Create token accounts
    voterTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      voter,
      tokenMint,
      voter.publicKey
    );
    
    unauthorizedTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      unauthorizedUser,
      tokenMint,
      unauthorizedUser.publicKey
    );
    
    // Mint tokens to voter
    await mintTo(
      provider.connection,
      authority,
      tokenMint,
      voterTokenAccount,
      authority.publicKey,
      100
    );
    
    // Find PDAs
    [boardPDA, boardBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reputation_board")],
      program.programId
    );
    
    [targetEntryPDA, targetEntryBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reputation_entry"), target.publicKey.toBuffer()],
      program.programId
    );
    
    [voteRecordPDA, voteRecordBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vote_record"), voter.publicKey.toBuffer(), target.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Initializes the reputation board", async () => {
    // Initialize the board with our test parameters
    await program.methods
      .initializeBoard(cooldownPeriod, topContributorThreshold)
      .accounts({
        board: boardPDA,
        authority: authority.publicKey,
        tokenMint: tokenMint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
    
    // Fetch the board account and verify its data
    const boardAccount = await program.account.reputationBoard.fetch(boardPDA);
    
    assert.ok(boardAccount.authority.equals(authority.publicKey));
    assert.ok(boardAccount.tokenMint.equals(tokenMint));
    assert.ok(boardAccount.cooldown.eq(cooldownPeriod));
    assert.ok(boardAccount.topContributorThreshold.eq(topContributorThreshold));
  });

  it("Upvotes a target", async () => {
    // Upvote the target
    await program.methods
      .upvote()
      .accounts({
        board: boardPDA,
        targetEntry: targetEntryPDA,
        voteRecord: voteRecordPDA,
        voter: voter.publicKey,
        target: target.publicKey,
        voterTokenAccount: voterTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([voter])
      .rpc();
    
    // Fetch the target entry and verify its reputation increased
    const targetEntry = await program.account.reputationEntry.fetch(targetEntryPDA);
    
    assert.ok(targetEntry.user.equals(target.publicKey));
    assert.equal(targetEntry.reputation.toNumber(), 1);
    assert.equal(targetEntry.topContributor, false);
    
    // Fetch the vote record and verify it was created
    const voteRecord = await program.account.voteRecord.fetch(voteRecordPDA);
    
    assert.ok(voteRecord.voter.equals(voter.publicKey));
    assert.ok(voteRecord.target.equals(target.publicKey));
    assert.notEqual(voteRecord.lastVoteTimestamp.toNumber(), 0);
  });

  it("Fails to upvote again during cooldown period", async () => {
    try {
      // Try to upvote again immediately
      await program.methods
        .upvote()
        .accounts({
          board: boardPDA,
          targetEntry: targetEntryPDA,
          voteRecord: voteRecordPDA,
          voter: voter.publicKey,
          target: target.publicKey,
          voterTokenAccount: voterTokenAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([voter])
        .rpc();
      
      assert.fail("Expected error due to cooldown not passed");
    } catch (err) {
      // Verify the error is about cooldown
      assert.include(err.message, "Cooldown period has not passed since last vote");
    }
  });

  it("Upvotes again after cooldown period", async () => {
    // Wait for cooldown to pass
    await new Promise(resolve => setTimeout(resolve, cooldownPeriod.toNumber() * 1000 + 1000));
    
    // Upvote again
    await program.methods
      .upvote()
      .accounts({
        board: boardPDA,
        targetEntry: targetEntryPDA,
        voteRecord: voteRecordPDA,
        voter: voter.publicKey,
        target: target.publicKey,
        voterTokenAccount: voterTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([voter])
      .rpc();
    
    // Verify reputation increased again
    const targetEntry = await program.account.reputationEntry.fetch(targetEntryPDA);
    assert.equal(targetEntry.reputation.toNumber(), 2);
  });

  it("Downvotes a target", async () => {
    // Wait for cooldown to pass
    await new Promise(resolve => setTimeout(resolve, cooldownPeriod.toNumber() * 1000 + 1000));
    
    // Downvote the target
    await program.methods
      .downvote()
      .accounts({
        board: boardPDA,
        targetEntry: targetEntryPDA,
        voteRecord: voteRecordPDA,
        voter: voter.publicKey,
        target: target.publicKey,
        voterTokenAccount: voterTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([voter])
      .rpc();
    
    // Verify reputation decreased
    const targetEntry = await program.account.reputationEntry.fetch(targetEntryPDA);
    assert.equal(targetEntry.reputation.toNumber(), 1);
  });

  it("Fails to vote without token balance", async () => {
    // Create a new vote record PDA for the unauthorized user
    const [unauthorizedVoteRecordPDA] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vote_record"), unauthorizedUser.publicKey.toBuffer(), target.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      // Try to upvote without tokens
      await program.methods
        .upvote()
        .accounts({
          board: boardPDA,
          targetEntry: targetEntryPDA,
          voteRecord: unauthorizedVoteRecordPDA,
          voter: unauthorizedUser.publicKey,
          target: target.publicKey,
          voterTokenAccount: unauthorizedTokenAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([unauthorizedUser])
        .rpc();
      
      assert.fail("Expected error due to insufficient token balance");
    } catch (err) {
      // Verify the error is about token balance
      assert.include(err.message, "Insufficient token balance");
    }
  });

  it("Upvotes to reach top contributor threshold", async () => {
    // Wait for cooldown to pass
    await new Promise(resolve => setTimeout(resolve, cooldownPeriod.toNumber() * 1000 + 1000));
    
    // Upvote to reach threshold
    await program.methods
      .upvote()
      .accounts({
        board: boardPDA,
        targetEntry: targetEntryPDA,
        voteRecord: voteRecordPDA,
        voter: voter.publicKey,
        target: target.publicKey,
        voterTokenAccount: voterTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([voter])
      .rpc();
    
    // Wait for cooldown to pass
    await new Promise(resolve => setTimeout(resolve, cooldownPeriod.toNumber() * 1000 + 1000));
    
    // Upvote again to exceed threshold
    await program.methods
      .upvote()
      .accounts({
        board: boardPDA,
        targetEntry: targetEntryPDA,
        voteRecord: voteRecordPDA,
        voter: voter.publicKey,
        target: target.publicKey,
        voterTokenAccount: voterTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([voter])
      .rpc();
    
    // Verify reputation is now at threshold
    const targetEntry = await program.account.reputationEntry.fetch(targetEntryPDA);
    assert.equal(targetEntry.reputation.toNumber(), 3);
  });

  it("Unlocks top contributor role", async () => {
    // Unlock the role
    await program.methods
      .unlockRole()
      .accounts({
        board: boardPDA,
        userEntry: targetEntryPDA,
        user: target.publicKey,
      })
      .rpc();
    
    // Verify top contributor flag is set
    const targetEntry = await program.account.reputationEntry.fetch(targetEntryPDA);
    assert.equal(targetEntry.topContributor, true);
  });

  it("Fails to unlock role without enough reputation", async () => {
    // Find PDA for another target
    const [anotherTargetEntryPDA] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("reputation_entry"), anotherTarget.publicKey.toBuffer()],
      program.programId
    );
    
    // Create a vote record for the new target
    const [anotherVoteRecordPDA] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vote_record"), voter.publicKey.toBuffer(), anotherTarget.publicKey.toBuffer()],
      program.programId
    );
    
    // Upvote the new target once (not enough to reach threshold)
    await program.methods
      .upvote()
      .accounts({
        board: boardPDA,
        targetEntry: anotherTargetEntryPDA,
        voteRecord: anotherVoteRecordPDA,
        voter: voter.publicKey,
        target: anotherTarget.publicKey,
        voterTokenAccount: voterTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([voter])
      .rpc();
    
    try {
      // Try to unlock role without enough reputation
      await program.methods
        .unlockRole()
        .accounts({
          board: boardPDA,
          userEntry: anotherTargetEntryPDA,
          user: anotherTarget.publicKey,
        })
        .rpc();
      
      assert.fail("Expected error due to insufficient reputation");
    } catch (err) {
      // Verify the error is about reputation
      assert.include(err.message, "Insufficient reputation");
    }
  });

  it("Resets a target's score", async () => {
    // Reset the target's score
    await program.methods
      .resetScore()
      .accounts({
        board: boardPDA,
        targetEntry: targetEntryPDA,
        authority: authority.publicKey,
        target: target.publicKey,
      })
      .signers([authority])
      .rpc();
    
    // Verify reputation is reset to 0 and top contributor flag is cleared
    const targetEntry = await program.account.reputationEntry.fetch(targetEntryPDA);
    assert.equal(targetEntry.reputation.toNumber(), 0);
    assert.equal(targetEntry.topContributor, false);
  });

  it("Fails to reset score without authority", async () => {
    try {
      // Try to reset score without authority
      await program.methods
        .resetScore()
        .accounts({
          board: boardPDA,
          targetEntry: targetEntryPDA,
          authority: unauthorizedUser.publicKey,
          target: target.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();
      
      assert.fail("Expected error due to unauthorized reset");
    } catch (err) {
      // Verify the error is about authorization
      assert.include(err.message, "Not authorized");
    }
  });
});