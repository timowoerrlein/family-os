import { type Actor, systemActor } from '@famos/sdk';
import { createTestKernel, type TestKernel } from '@famos/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Task } from '../src/contract/index.ts';
import lists from '../src/server/index.ts';

let k: TestKernel;

beforeEach(async () => {
	k = await createTestKernel({ extensions: [lists] });
	await k.runner.invoke(
		'core.updateFamilySettings',
		{ timeZone: 'Europe/Berlin' },
		systemActor('t'),
	);
});
afterEach(() => k.close());

const display = (...capabilities: string[]): Actor => ({
	kind: 'display',
	deviceId: 'dev_1',
	capabilities,
	showNames: false,
});

async function newTask(): Promise<Task> {
	const { actor } = await k.member('admin');
	const result = await k.runner.invoke('lists.addTask', { title: 'Bins' }, actor);
	if (result.status !== 'applied') throw new Error('expected applied');
	return result.output as Task;
}

describe('a display that may tick off tasks', () => {
	it('completes a task, with nobody named as the one who did it', async () => {
		const task = await newTask();
		const result = await k.runner.invoke(
			'lists.completeTask',
			{ id: task.id },
			display('lists.view', 'lists.tasks.displayComplete'),
		);
		expect(result.status).toBe('applied');
		const done = (await k.route('lists.listTasks').call()) as Task[];
		const row = done.find((t) => t.id === task.id);
		expect(row).toBeDefined();
		expect(row?.doneAt).toEqual(expect.any(Number));
		expect(row?.doneBy).toBeNull();
	});

	it('is refused without the grant', async () => {
		const task = await newTask();
		await expect(
			k.runner.invoke('lists.completeTask', { id: task.id }, display('lists.view')),
		).rejects.toMatchObject({ code: 'forbidden', details: { reason: 'display' } });
	});

	it('still cannot run any other action', async () => {
		const grant = display('lists.view', 'lists.tasks.displayComplete');
		await expect(
			k.runner.invoke('lists.addTask', { title: 'Sneaky' }, grant),
		).rejects.toMatchObject({ code: 'forbidden', details: { reason: 'display' } });
		const task = await newTask();
		await expect(k.runner.invoke('lists.deleteTask', { id: task.id }, grant)).rejects.toMatchObject(
			{ code: 'forbidden' },
		);
		await expect(k.runner.invoke('lists.reopenTask', { id: task.id }, grant)).rejects.toMatchObject(
			{ code: 'forbidden' },
		);
	});
});
